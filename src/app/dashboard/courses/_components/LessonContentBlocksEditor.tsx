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

/**
 * Editor-side shape: lists are edited as one-per-line text, everything else
 * matches the stored value. Kept separate from the news editor on purpose —
 * `video` blocks must not reach `news` or `events` until the app rollout is
 * complete, and the news normalizer would silently flatten them.
 */
export type LessonFormBlock =
  | { type: LessonContentType.Title; value: string }
  | { type: LessonContentType.Paragraph; value: string }
  | { type: LessonContentType.Banner; value: string }
  | { type: LessonContentType.List; value: string }
  | { type: LessonContentType.Quote; value: LessonQuoteValue }
  | { type: LessonContentType.Video; value: LessonVideoValue }
  | { type: LessonContentType.Audio; value: LessonAudioValue };

function emptyBlock(type: LessonContentType): LessonFormBlock {
  switch (type) {
    case LessonContentType.Quote:
      return { type, value: { text: "", ref: "" } };
    case LessonContentType.Video:
      return { type, value: { videoType: "youtube", url: "" } };
    case LessonContentType.Audio:
      return { type, value: { url: "" } };
    case LessonContentType.List:
      return { type, value: "" };
    default:
      return { type: type as LessonContentType.Paragraph, value: "" };
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

export default function LessonContentBlocksEditor({
  items,
  onChange,
  lessonTitle,
}: {
  items: LessonFormBlock[];
  onChange: (next: LessonFormBlock[]) => void;
  lessonTitle?: string;
}) {
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  const replaceAt = (idx: number, next: LessonFormBlock) =>
    onChange(items.map((b, i) => (i === idx ? next : b)));

  return (
    <div className="sm:col-span-2">
      <label className="block text-sm font-medium text-primary-800">
        Content Blocks
      </label>

      <DraggableList
        items={items}
        onReorder={(next) => onChange(next)}
        listClassName="mt-2 space-y-3"
        itemClassName="rounded-md border border-primary-200 p-3"
        renderItem={(blk, idx) => (
          <div>
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

            {blk.type === LessonContentType.List && (
              <textarea
                value={blk.value}
                onChange={(e) =>
                  replaceAt(idx, { type: blk.type, value: e.target.value })
                }
                className="mt-2 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="One item per line"
                rows={3}
              />
            )}

            {blk.type === LessonContentType.Quote && (
              <QuoteBlockFields
                value={blk.value}
                requireRef
                onChange={(next) => replaceAt(idx, { type: blk.type, value: next })}
              />
            )}

            {blk.type === LessonContentType.Banner && (
              <div className="mt-2 flex flex-col gap-2">
                <FileUploadButton
                  label={
                    uploadingIndex === idx ? "Uploading..." : "Upload Banner Image"
                  }
                  accept="image/*"
                  disabled={uploadingIndex === idx}
                  onSelect={async (f) => {
                    try {
                      setUploadingIndex(idx);
                      const url = await uploadLessonImage(
                        f,
                        lessonTitle || "banner",
                      );
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
            )}

            {blk.type === LessonContentType.Audio && (
              <AudioBlockFields
                value={blk.value}
                uploading={uploadingIndex === idx}
                onUploadingChange={(on) => setUploadingIndex(on ? idx : null)}
                lessonTitle={lessonTitle}
                onChange={(next) => replaceAt(idx, { type: blk.type, value: next })}
              />
            )}

            {blk.type === LessonContentType.Video && (
              <VideoBlockFields
                value={blk.value}
                uploading={uploadingIndex === idx}
                onUploadingChange={(on) => setUploadingIndex(on ? idx : null)}
                lessonTitle={lessonTitle}
                onChange={(next) => replaceAt(idx, { type: blk.type, value: next })}
              />
            )}

            {(blk.type === LessonContentType.Title ||
              blk.type === LessonContentType.Paragraph) && (
              <input
                type="text"
                value={blk.value}
                onChange={(e) =>
                  replaceAt(idx, { type: blk.type, value: e.target.value })
                }
                className="mt-2 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder={
                  blk.type === LessonContentType.Title
                    ? "Section title"
                    : "Paragraph text"
                }
              />
            )}
          </div>
        )}
      />
      {items.length === 0 && (
        <p className="mt-2 text-xs text-primary-600">
          A lesson needs at least one content block.
        </p>
      )}

      {/* Below the list, so it stays next to the block you just finished
          rather than scrolling away above a long lesson. */}
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
    </div>
  );
}

function AudioBlockFields({
  value,
  uploading,
  onUploadingChange,
  lessonTitle,
  onChange,
}: {
  value: LessonAudioValue;
  uploading: boolean;
  onUploadingChange: (on: boolean) => void;
  lessonTitle?: string;
  onChange: (next: LessonAudioValue) => void;
}) {
  // The audios collection is the usual source; uploading straight to the
  // lesson is the fallback for one-off recordings.
  const [library, setLibrary] = useState<WithAudioId<AudioDoc>[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);

  useEffect(() => {
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
  }, []);

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
            title: picked.title || value.title,
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

      <input
        type="text"
        value={value.title ?? ""}
        onChange={(e) => onChange({ ...value, title: e.target.value })}
        className="block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        placeholder="Title shown next to the player (optional)"
      />
      <input
        type="text"
        value={value.caption ?? ""}
        onChange={(e) => onChange({ ...value, caption: e.target.value })}
        className="block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        placeholder="Caption under the player (optional)"
      />
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
  uploading,
  onUploadingChange,
  lessonTitle,
  onChange,
}: {
  value: LessonVideoValue;
  uploading: boolean;
  onUploadingChange: (on: boolean) => void;
  lessonTitle?: string;
  onChange: (next: LessonVideoValue) => void;
}) {
  const isYouTube = value.videoType === "youtube";
  // The app stores the 11-char id; a watch/share URL is normalized on save.
  const resolvedId = isYouTube ? extractYouTubeVideoId(value.url) : undefined;
  const youtubeUnresolved = isYouTube && !!value.url.trim() && !resolvedId;
  const hostedNeedsThumb =
    !isYouTube && !!value.url.trim() && !value.thumbnailUrl?.trim();

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

      <input
        type="text"
        value={value.title ?? ""}
        onChange={(e) => onChange({ ...value, title: e.target.value })}
        className="block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        placeholder="Title shown over the poster (optional)"
      />
      <input
        type="text"
        value={value.caption ?? ""}
        onChange={(e) => onChange({ ...value, caption: e.target.value })}
        className="block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        placeholder="Caption under the player (optional)"
      />

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
