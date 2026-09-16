"use client";

import { useEffect, useState } from "react";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import DraggableList from "@/components/ui/DraggableList";
import FileUploadButton from "@/components/ui/FileUploadButton";
import QuoteBlockFields from "@/components/ui/QuoteBlockFields";
import MediaDurationField from "./MediaDurationField";
import { uploadAudioFile, uploadLessonImage } from "@/lib/api/storage";
import { extractYouTubeVideoId } from "@/lib/api/videos";
import { listAudios } from "@/lib/api/audios";
import type { AudioDoc, WithId as WithAudioId } from "@/lib/api/audios";
import { LessonContentType } from "@/lib/api/lessons";
import type {
  LessonAudioValue,
  LessonQuoteValue,
  LessonVideoValue,
} from "@/lib/api/lessons";
import { CONTENT_LOCALE_LABELS } from "@/lib/i18n/contentLocales";
import type { ContentLocale } from "@/lib/i18n/contentLocales";
import type { LocalizedText } from "@/lib/i18n/localizedText";

/**
 * Editor-side shape. Identical to the stored block except that a list is
 * edited as one-item-per-line text rather than an array — per language, so the
 * map is `{ en: "a\nb", am: "…" }`.
 */
export type LessonFormBlock =
  | { type: LessonContentType.Title; value: LocalizedText }
  | { type: LessonContentType.Paragraph; value: LocalizedText }
  | { type: LessonContentType.Banner; value: string }
  | { type: LessonContentType.List; value: LocalizedText }
  | { type: LessonContentType.Quote; value: LessonQuoteValue }
  | { type: LessonContentType.Video; value: LessonVideoValue }
  | { type: LessonContentType.Audio; value: LessonAudioValue };

function emptyBlock(type: LessonContentType): LessonFormBlock {
  switch (type) {
    case LessonContentType.Quote:
      return { type, value: { text: {}, ref: "" } };
    case LessonContentType.Video:
      return { type, value: { videoType: "youtube", url: "" } };
    case LessonContentType.Audio:
      return { type, value: { url: "" } };
    case LessonContentType.Banner:
      return { type, value: "" };
    case LessonContentType.List:
      return { type, value: {} };
    default:
      return { type: type as LessonContentType.Paragraph, value: {} };
  }
}

const TYPE_OPTIONS: { value: LessonContentType; label: string }[] = [
  { value: LessonContentType.Title, label: "title" },
  { value: LessonContentType.Paragraph, label: "paragraph" },
  { value: LessonContentType.List, label: "list" },
  { value: LessonContentType.Quote, label: "quote" },
  { value: LessonContentType.Banner, label: "banner" },
  { value: LessonContentType.Video, label: "video" },
  { value: LessonContentType.Audio, label: "audio" },
];

const set = (
  value: LocalizedText | undefined,
  locale: ContentLocale,
  text: string,
): LocalizedText => ({ ...value, [locale]: text });

/** The primary-language text, shown above a translation input as reference. */
function Reference({ text }: { text: string }) {
  return (
    <p className="mt-1 whitespace-pre-wrap rounded border border-primary-200 bg-primary-50 px-2 py-1 text-xs text-primary-700">
      {text || <span className="italic text-primary-500">(empty)</span>}
    </p>
  );
}

/**
 * The lesson body editor, for one language at a time.
 *
 * **Structure belongs to the primary language.** On any other tab the type
 * `<select>`, Add Block, Remove and drag-reorder are all absent, and so are
 * the fields that are not prose — a media URL, a duration, a banner image.
 * Showing them on the Amharic tab would imply they are per-language, and a
 * translation that could reorder blocks would make the lesson a different
 * lesson depending on who is reading it.
 *
 * Everything the translator does see shows the primary text above it, and
 * leaving a field blank inherits that text rather than rendering a hole.
 */
export default function LessonContentBlocksEditor({
  items,
  onChange,
  locale,
  defaultLocale,
  lessonTitle,
}: {
  items: LessonFormBlock[];
  onChange: (next: LessonFormBlock[]) => void;
  locale: ContentLocale;
  defaultLocale: ContentLocale;
  lessonTitle?: string;
}) {
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const isPrimary = locale === defaultLocale;
  const primaryLabel = CONTENT_LOCALE_LABELS[defaultLocale];

  const replaceAt = (idx: number, next: LessonFormBlock) =>
    onChange(items.map((b, i) => (i === idx ? next : b)));

  const renderBlock = (blk: LessonFormBlock, idx: number) => (
    <div>
      {isPrimary ? (
        <div className="flex items-center gap-2">
          <select
            value={blk.type}
            onChange={(e) =>
              replaceAt(idx, emptyBlock(e.target.value as LessonContentType))
            }
            className="rounded-md border border-primary-300 bg-white px-2 py-1 text-sm"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <AppButton
            type="button"
            variant={AppButtonVariant.Delete}
            className="ml-auto px-3 py-1 text-xs"
            onClick={() => onChange(items.filter((_, i) => i !== idx))}
          >
            Remove
          </AppButton>
        </div>
      ) : (
        <p className="text-[11px] font-medium uppercase tracking-wide text-primary-500">
          #{idx + 1} · {blk.type}
        </p>
      )}

      {blk.type === LessonContentType.List && (
        <>
          {!isPrimary && <Reference text={blk.value[defaultLocale] ?? ""} />}
          <textarea
            value={blk.value[locale] ?? ""}
            onChange={(e) =>
              replaceAt(idx, {
                type: blk.type,
                value: set(blk.value, locale, e.target.value),
              })
            }
            className="mt-2 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="One item per line"
            rows={3}
          />
          {!isPrimary && (
            <p className="mt-1 text-[11px] text-primary-600">
              Items are matched line by line; a blank line keeps the{" "}
              {primaryLabel} item.
            </p>
          )}
        </>
      )}

      {blk.type === LessonContentType.Quote &&
        (isPrimary ? (
          <QuoteBlockFields
            value={{ ...blk.value, text: blk.value.text[locale] ?? "" }}
            requireRef
            onChange={(next) =>
              replaceAt(idx, {
                type: blk.type,
                value: {
                  ...next,
                  text: set(blk.value.text, locale, next.text),
                },
              })
            }
          />
        ) : (
          <>
            <Reference text={blk.value.text[defaultLocale] ?? ""} />
            <input
              type="text"
              value={blk.value.text[locale] ?? ""}
              onChange={(e) =>
                replaceAt(idx, {
                  type: blk.type,
                  value: {
                    ...blk.value,
                    text: set(blk.value.text, locale, e.target.value),
                  },
                })
              }
              className="mt-2 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Quote text"
            />
            <p className="mt-1 text-[11px] text-primary-600">
              The reference stays as it is — it is a verse coordinate, not text.
            </p>
          </>
        ))}

      {blk.type === LessonContentType.Banner &&
        (isPrimary ? (
          <div className="mt-2 flex flex-col gap-2">
            <FileUploadButton
              label={uploadingIndex === idx ? "Uploading..." : "Upload Banner Image"}
              accept="image/*"
              disabled={uploadingIndex === idx}
              onSelect={async (f) => {
                try {
                  setUploadingIndex(idx);
                  const url = await uploadLessonImage(f, lessonTitle || "banner");
                  replaceAt(idx, { type: blk.type, value: url });
                } finally {
                  setUploadingIndex((cur) => (cur === idx ? null : cur));
                }
              }}
            />
            <input
              type="url"
              value={blk.value}
              onChange={(e) =>
                replaceAt(idx, { type: blk.type, value: e.target.value })
              }
              className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="https://banner.example/..."
            />
            {blk.value ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={blk.value}
                alt="banner preview"
                className="h-20 w-full rounded border object-cover"
              />
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-primary-600">
            One image serves every language — nothing to translate here.
          </p>
        ))}

      {blk.type === LessonContentType.Audio && (
        <AudioBlockFields
          value={blk.value}
          locale={locale}
          defaultLocale={defaultLocale}
          uploading={uploadingIndex === idx}
          onUploadingChange={(on) => setUploadingIndex(on ? idx : null)}
          lessonTitle={lessonTitle}
          onChange={(next) => replaceAt(idx, { type: blk.type, value: next })}
        />
      )}

      {blk.type === LessonContentType.Video && (
        <VideoBlockFields
          value={blk.value}
          locale={locale}
          defaultLocale={defaultLocale}
          uploading={uploadingIndex === idx}
          onUploadingChange={(on) => setUploadingIndex(on ? idx : null)}
          lessonTitle={lessonTitle}
          onChange={(next) => replaceAt(idx, { type: blk.type, value: next })}
        />
      )}

      {(blk.type === LessonContentType.Title ||
        blk.type === LessonContentType.Paragraph) && (
        <>
          {!isPrimary && <Reference text={blk.value[defaultLocale] ?? ""} />}
          <input
            type="text"
            value={blk.value[locale] ?? ""}
            onChange={(e) =>
              replaceAt(idx, {
                type: blk.type,
                value: set(blk.value, locale, e.target.value),
              })
            }
            className="mt-2 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder={
              blk.type === LessonContentType.Title
                ? "Section title"
                : "Paragraph text"
            }
          />
        </>
      )}
    </div>
  );

  return (
    <div className="sm:col-span-2">
      <label className="block text-sm font-medium text-primary-800">
        Content Blocks
      </label>
      {!isPrimary && (
        <p className="mt-1 text-xs text-primary-600">
          Structure follows {primaryLabel}. Leave a field blank to inherit its{" "}
          {primaryLabel} text — blank never renders as empty.
        </p>
      )}

      {isPrimary ? (
        <DraggableList
          items={items}
          onReorder={(next) => onChange(next)}
          listClassName="mt-2 space-y-3"
          itemClassName="rounded-md border border-primary-200 p-3"
          renderItem={renderBlock}
        />
      ) : (
        <div className="mt-2 space-y-3">
          {items.map((blk, idx) => (
            <div key={idx} className="rounded-md border border-primary-200 p-3">
              {renderBlock(blk, idx)}
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <p className="mt-2 text-xs text-primary-600">
          {isPrimary
            ? "A lesson needs at least one content block."
            : `Add the content on the ${primaryLabel} tab first.`}
        </p>
      )}

      {/* Below the list, so it stays next to the block you just finished
          rather than scrolling away above a long lesson. */}
      {isPrimary && (
        <AppButton
          type="button"
          variant={AppButtonVariant.Add}
          className="mt-3 px-3 py-1 text-xs"
          onClick={() =>
            onChange([...items, emptyBlock(LessonContentType.Paragraph)])
          }
        >
          Add Block
        </AppButton>
      )}
    </div>
  );
}

function AudioBlockFields({
  value,
  locale,
  defaultLocale,
  uploading,
  onUploadingChange,
  lessonTitle,
  onChange,
}: {
  value: LessonAudioValue;
  locale: ContentLocale;
  defaultLocale: ContentLocale;
  uploading: boolean;
  onUploadingChange: (on: boolean) => void;
  lessonTitle?: string;
  onChange: (next: LessonAudioValue) => void;
}) {
  // The audios collection is the usual source; uploading straight to the
  // lesson is the fallback for one-off recordings.
  const [library, setLibrary] = useState<WithAudioId<AudioDoc>[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const isPrimary = locale === defaultLocale;

  useEffect(() => {
    if (!isPrimary) return;
    let cancelled = false;
    listAudios()
      .then((list) => {
        if (!cancelled) setLibrary(list.filter((a) => !!a.audioUrl));
      })
      .catch(() => {
        if (!cancelled) setLibrary([]);
      })
      .finally(() => {
        if (!cancelled) setLibraryLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isPrimary]);

  const textFields = (
    <>
      {!isPrimary && <Reference text={value.title?.[defaultLocale] ?? ""} />}
      <input
        type="text"
        value={value.title?.[locale] ?? ""}
        onChange={(e) =>
          onChange({ ...value, title: set(value.title, locale, e.target.value) })
        }
        className="block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        placeholder="Title shown next to the player (optional)"
      />
      {!isPrimary && <Reference text={value.caption?.[defaultLocale] ?? ""} />}
      <input
        type="text"
        value={value.caption?.[locale] ?? ""}
        onChange={(e) =>
          onChange({
            ...value,
            caption: set(value.caption, locale, e.target.value),
          })
        }
        className="block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        placeholder="Caption under the player (optional)"
      />
    </>
  );

  if (!isPrimary) {
    return (
      <div className="mt-2 space-y-2">
        <p className="text-xs text-primary-600">
          The audio file is inherited — only the label and caption are
          translated.
        </p>
        {textFields}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <select
        value={value.audioId ?? ""}
        onChange={(e) => {
          const picked = library.find((a) => a.id === e.target.value);
          if (!picked) {
            // "Custom" — keep whatever URL is typed, just drop the link.
            onChange({ ...value, audioId: undefined });
            return;
          }
          onChange({
            ...value,
            audioId: picked.id,
            url: picked.audioUrl ?? "",
            title: picked.title
              ? set(value.title, locale, picked.title)
              : value.title,
            thumbnailUrl: picked.thumbnailUrl || value.thumbnailUrl,
            // A different file: drop the old length rather than leave it
            // standing if the new one can't be read.
            durationSeconds: undefined,
          });
        }}
        className="block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        <option value="">Custom audio (upload or paste a URL)</option>
        {library.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title || a.id}
            {a.audioBy ? ` — ${a.audioBy}` : ""}
          </option>
        ))}
      </select>
      {libraryLoaded && library.length === 0 && (
        <p className="text-xs text-primary-600">
          No audios found in <code>audios</code> — upload a file below.
        </p>
      )}

      <FileUploadButton
        label={uploading ? "Uploading..." : "Upload Audio File"}
        accept="audio/*"
        disabled={uploading}
        onSelect={async (f) => {
          try {
            onUploadingChange(true);
            const url = await uploadAudioFile(f, lessonTitle || "lesson-audio");
            onChange({
              ...value,
              url,
              audioId: undefined,
              durationSeconds: undefined,
            });
          } finally {
            onUploadingChange(false);
          }
        }}
      />
      <input
        type="url"
        value={value.url}
        onChange={(e) =>
          onChange({
            ...value,
            url: e.target.value,
            audioId: undefined,
            durationSeconds: undefined,
          })
        }
        className={`block w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
          value.url.trim()
            ? "border-primary-300 focus:ring-primary-500"
            : "border-red-400 focus:ring-red-500"
        }`}
        placeholder="https://.../audio.mp3"
        required
      />
      {!value.url.trim() && (
        <p className="text-xs text-red-600">
          An audio block without a file URL renders nothing.
        </p>
      )}
      {value.url.trim() && <audio src={value.url} controls className="w-full" />}

      <MediaDurationField
        kind="audio"
        url={value.url}
        autoProbe
        seconds={value.durationSeconds}
        onChange={(durationSeconds) => onChange({ ...value, durationSeconds })}
      />

      {textFields}

      <div className="flex flex-col gap-2">
        <FileUploadButton
          label="Upload Artwork"
          accept="image/*"
          disabled={uploading}
          onSelect={async (f) => {
            try {
              onUploadingChange(true);
              const url = await uploadLessonImage(f, lessonTitle || "audio");
              onChange({ ...value, thumbnailUrl: url });
            } finally {
              onUploadingChange(false);
            }
          }}
        />
        <input
          type="url"
          value={value.thumbnailUrl ?? ""}
          onChange={(e) => onChange({ ...value, thumbnailUrl: e.target.value })}
          className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Artwork URL (optional)"
        />
        {value.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value.thumbnailUrl}
            alt="audio artwork"
            className="h-20 w-20 rounded border object-cover"
          />
        ) : null}
      </div>
    </div>
  );
}

function VideoBlockFields({
  value,
  locale,
  defaultLocale,
  uploading,
  onUploadingChange,
  lessonTitle,
  onChange,
}: {
  value: LessonVideoValue;
  locale: ContentLocale;
  defaultLocale: ContentLocale;
  uploading: boolean;
  onUploadingChange: (on: boolean) => void;
  lessonTitle?: string;
  onChange: (next: LessonVideoValue) => void;
}) {
  const isPrimary = locale === defaultLocale;
  const isYouTube = value.videoType === "youtube";
  // The app stores the 11-char id; a watch/share URL is normalized on save.
  const resolvedId = isYouTube ? extractYouTubeVideoId(value.url) : undefined;
  const youtubeUnresolved = isYouTube && !!value.url.trim() && !resolvedId;
  const hostedNeedsThumb =
    !isYouTube && !!value.url.trim() && !value.thumbnailUrl?.trim();

  const textFields = (
    <>
      {!isPrimary && <Reference text={value.title?.[defaultLocale] ?? ""} />}
      <input
        type="text"
        value={value.title?.[locale] ?? ""}
        onChange={(e) =>
          onChange({ ...value, title: set(value.title, locale, e.target.value) })
        }
        className="block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        placeholder="Title shown over the poster (optional)"
      />
      {!isPrimary && <Reference text={value.caption?.[defaultLocale] ?? ""} />}
      <input
        type="text"
        value={value.caption?.[locale] ?? ""}
        onChange={(e) =>
          onChange({
            ...value,
            caption: set(value.caption, locale, e.target.value),
          })
        }
        className="block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        placeholder="Caption under the player (optional)"
      />
    </>
  );

  if (!isPrimary) {
    return (
      <div className="mt-2 space-y-2">
        <p className="text-xs text-primary-600">
          The video is inherited — only the label and caption are translated.
        </p>
        {textFields}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select
          value={value.videoType}
          onChange={(e) =>
            onChange({
              ...value,
              videoType: e.target.value as LessonVideoValue["videoType"],
              // Switching source changes how the length is obtained.
              durationSeconds: undefined,
            })
          }
          className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm"
        >
          <option value="youtube">youtube</option>
          <option value="hosted">hosted</option>
        </select>
        <input
          type="text"
          value={value.url}
          onChange={(e) =>
            onChange({
              ...value,
              url: e.target.value,
              // A different video: the old length no longer describes it.
              durationSeconds: undefined,
            })
          }
          className={`rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
            youtubeUnresolved
              ? "border-red-400 focus:ring-red-500"
              : "border-primary-300 focus:ring-primary-500"
          }`}
          placeholder={
            isYouTube ? "Video id or YouTube URL" : "https://.../video.mp4"
          }
          required
        />
      </div>

      {youtubeUnresolved && (
        <p className="text-xs text-red-600">
          No 11-character video id could be read from that URL — the block would
          render nothing.
        </p>
      )}
      {isYouTube && resolvedId && (
        <p className="text-xs text-primary-600">
          Saves as <code className="font-mono">{resolvedId}</code>
        </p>
      )}

      {textFields}

      <MediaDurationField
        kind="video"
        url={value.url}
        autoProbe={!isYouTube}
        seconds={value.durationSeconds}
        onChange={(durationSeconds) => onChange({ ...value, durationSeconds })}
      />

      <div className="flex flex-col gap-2">
        <FileUploadButton
          label={uploading ? "Uploading..." : "Upload Thumbnail"}
          accept="image/*"
          disabled={uploading}
          onSelect={async (f) => {
            try {
              onUploadingChange(true);
              const url = await uploadLessonImage(f, lessonTitle || "video");
              onChange({ ...value, thumbnailUrl: url });
            } finally {
              onUploadingChange(false);
            }
          }}
        />
        <input
          type="url"
          value={value.thumbnailUrl ?? ""}
          onChange={(e) => onChange({ ...value, thumbnailUrl: e.target.value })}
          className={`rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
            hostedNeedsThumb
              ? "border-red-400 focus:ring-red-500"
              : "border-primary-300 focus:ring-primary-500"
          }`}
          placeholder={
            isYouTube
              ? "Optional — falls back to the YouTube poster"
              : "Required for hosted video"
          }
        />
        {hostedNeedsThumb && (
          <p className="text-xs text-red-600">
            Hosted videos have no fallback poster — without a thumbnail the
            player shows a black box.
          </p>
        )}
      </div>
    </div>
  );
}
