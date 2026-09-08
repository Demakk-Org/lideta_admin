"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import AppModal from "@/components/ui/AppModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import FileUploadButton from "@/components/ui/FileUploadButton";
import LocaleTabs from "@/components/ui/LocaleTabs";
import { uploadLessonImage } from "@/lib/api/storage";
import {
  LessonContentType,
  projectContent,
  validateLessonContent,
} from "@/lib/api/lessons";
import type {
  LessonContentItem,
  LessonDoc,
  LessonWriteInput,
  WithId,
} from "@/lib/api/lessons";
import { estimateLesson, formatDuration } from "@/lib/api/lessonEstimate";
import { CONTENT_LOCALE_LABELS } from "@/lib/i18n/contentLocales";
import type { ContentLocale } from "@/lib/i18n/contentLocales";
import { localesOf } from "@/lib/i18n/localizedText";
import type { LocalizedList, LocalizedText } from "@/lib/i18n/localizedText";
import type { UserDoc, WithId as WithUserId } from "@/lib/api/users";
import LessonContentBlocksEditor, {
  type LessonFormBlock,
} from "./LessonContentBlocksEditor";

/** A list block is edited as one-item-per-line text, per language. */
function toFormBlocks(content: LessonContentItem[]): LessonFormBlock[] {
  return content.map((b) => {
    if (b.type === LessonContentType.List) {
      const value: LocalizedText = {};
      for (const l of localesOf(b.value)) value[l] = b.value[l]!.join("\n");
      return { type: b.type, value };
    }
    return b as LessonFormBlock;
  });
}

function toContent(blocks: LessonFormBlock[]): LessonContentItem[] {
  return blocks.map((b) => {
    if (b.type === LessonContentType.List) {
      const value: LocalizedList = {};
      for (const l of localesOf(b.value)) {
        value[l] = b.value[l]!
          .split(/\r?\n/)
          .map((v) => v.trim())
          .filter(Boolean);
      }
      return { type: LessonContentType.List, value };
    }
    return b as LessonContentItem;
  });
}

export default function LessonFormModal({
  open,
  mode,
  courseId,
  /**
   * The owning course's primary language. A lesson carries no
   * `defaultLanguage` of its own — it mirrors the course's, so the two can
   * never disagree about which language is primary.
   */
  primaryLocale,
  initial,
  addLanguage,
  defaultOrder,
  users,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "add" | "edit";
  courseId: string;
  primaryLocale: ContentLocale;
  initial?: WithId<LessonDoc>;
  /** Opens the modal on this language, adding a tab for it. */
  addLanguage?: ContentLocale;
  defaultOrder: number;
  users: WithUserId<UserDoc>[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: LessonWriteInput) => Promise<void> | void;
}) {
  const [title, setTitle] = useState<LocalizedText>({});
  const [shortDescription, setShortDescription] = useState<LocalizedText>({});
  const [category, setCategory] = useState<LocalizedText>({});
  const [tagsText, setTagsText] = useState<LocalizedText>({});
  const [blocks, setBlocks] = useState<LessonFormBlock[]>([]);
  const [languages, setLanguages] = useState<ContentLocale[]>([primaryLocale]);
  const [activeLocale, setActiveLocale] = useState<ContentLocale>(primaryLocale);
  const [authorId, setAuthorId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  /**
   * While true, the estimated minutes track the content on every edit. Typing
   * in the field turns it off; the suggestion chip turns it back on. It is
   * deliberately not persisted — a saved lesson reopens in manual mode showing
   * the number that was actually stored, with the suggestion one click away.
   */
  const [autoEstimate, setAutoEstimate] = useState(false);
  const [estimatedMinutes, setEstimatedMinutes] = useState("0");

  useEffect(() => {
    if (!open) return;
    const seededTitle = initial?.title ?? {};
    const present = localesOf(seededTitle);
    const opened =
      addLanguage && !present.includes(addLanguage)
        ? [...present, addLanguage]
        : present;

    setTitle(seededTitle);
    setShortDescription(initial?.shortDescription ?? {});
    setCategory(initial?.category ?? {});
    setTagsText(
      Object.fromEntries(
        localesOf(initial?.tags ?? {}).map((l) => [
          l,
          (initial?.tags[l] ?? []).join(", "),
        ]),
      ),
    );
    setLanguages(opened.length ? opened : [primaryLocale]);
    setActiveLocale(addLanguage ?? primaryLocale);
    setAuthorId(initial?.author_id ?? "");
    setImageUrl(initial?.imageUrl ?? "");
    setEstimatedMinutes(String(initial?.estimatedMinutes ?? 0));
    // A new lesson has no number worth preserving, so it starts on auto; an
    // existing one keeps whatever was saved until the admin accepts a change.
    setAutoEstimate(!initial);

    // A lesson always needs a block, so open with an empty paragraph rather
    // than an empty list — there is nothing useful to do with zero blocks.
    // It stays empty, so `validateLessonContent` still blocks submitting.
    const existing = toFormBlocks(initial?.content ?? []);
    setBlocks(
      existing.length > 0
        ? existing
        : [{ type: LessonContentType.Paragraph, value: {} }],
    );
  }, [open, initial, addLanguage, defaultOrder, primaryLocale]);

  const isEdit = mode === "edit";
  const isPrimaryTab = activeLocale === primaryLocale;
  const primaryLabel = CONTENT_LOCALE_LABELS[primaryLocale];

  const setLocalized = (
    setter: React.Dispatch<React.SetStateAction<LocalizedText>>,
    text: string,
  ) => setter((prev) => ({ ...prev, [activeLocale]: text }));

  const addLocale = (locale: ContentLocale) => {
    setLanguages((prev) => [...prev, locale]);
    setActiveLocale(locale);
  };

  const removeLocale = (locale: ContentLocale) => {
    if (locale === primaryLocale) return;
    const drop = (prev: LocalizedText) => {
      const next = { ...prev };
      delete next[locale];
      return next;
    };
    setLanguages((prev) => prev.filter((l) => l !== locale));
    setTitle(drop);
    setShortDescription(drop);
    setCategory(drop);
    setTagsText(drop);
    // The blocks share one array, so a removed language is cleared field by
    // field rather than by dropping anything structural.
    setBlocks((prev) => prev.map((b) => clearLocale(b, locale)));
    setActiveLocale(primaryLocale);
  };

  const content = useMemo(() => toContent(blocks), [blocks]);

  // Estimates and validation run on one language's view of the body — the
  // shape everything downstream, including the app's renderer, works on.
  const primaryView = useMemo(
    () => projectContent(content, { defaultLanguage: primaryLocale }),
    [content, primaryLocale],
  );
  const estimate = useMemo(() => estimateLesson(primaryView), [primaryView]);

  const titled = localesOf(title).filter((l) => (title[l] ?? "").trim());
  const contentIssues = useMemo(() => {
    const issues: string[] = [];
    for (const locale of titled) {
      const inLocale = projectContent(content, {
        selected: locale,
        defaultLanguage: primaryLocale,
      });
      for (const issue of validateLessonContent(inLocale)) {
        issues.push(
          titled.length > 1
            ? `${CONTENT_LOCALE_LABELS[locale]} — ${issue}`
            : issue,
        );
      }
    }
    return issues;
  }, [content, titled, primaryLocale]);

  const canSubmit =
    !!(title[primaryLocale] ?? "").trim() &&
    blocks.length > 0 &&
    contentIssues.length === 0;

  // Follows both additions and removals: the estimate is a function of the
  // current blocks, not a running total.
  useEffect(() => {
    if (autoEstimate) setEstimatedMinutes(String(estimate.minutes));
  }, [autoEstimate, estimate.minutes]);

  const suggestionDiffers =
    !autoEstimate && String(estimate.minutes) !== estimatedMinutes.trim();

  /**
   * A new lesson opens with one empty paragraph, which is invalid the moment
   * it appears. Scolding the admin before they have typed anything is noise,
   * so the issue list waits until the form has been touched. Saving is still
   * blocked either way.
   */
  const pristine =
    !initial &&
    !(title[primaryLocale] ?? "").trim() &&
    blocks.length === 1 &&
    blocks[0].type === LessonContentType.Paragraph &&
    localesOf(blocks[0].value).length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!(title[primaryLocale] ?? "").trim()) {
        throw new Error(`Title is required in ${primaryLabel}`);
      }
      if (content.length === 0) {
        throw new Error("A lesson needs at least one content block");
      }
      if (contentIssues.length) throw new Error(contentIssues.join("\n"));

      const tags: LocalizedList = {};
      for (const l of localesOf(tagsText)) {
        tags[l] = tagsText[l]!
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }

      await onSubmit({
        courseId,
        // Position is owned by the lessons list, which drag-and-drop rewrites
        // across the whole course. Editing a lesson must not move it, and a
        // new one goes on the end.
        order: initial?.order ?? defaultOrder,
        title,
        shortDescription,
        category,
        tags,
        defaultLanguage: primaryLocale,
        content,
        author_id: authorId.trim(),
        imageUrl: imageUrl.trim(),
        estimatedMinutes: Number(estimatedMinutes) || 0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submit failed";
      toast.error(msg);
    }
  };

  const localizedField = (
    label: string,
    value: LocalizedText,
    setter: React.Dispatch<React.SetStateAction<LocalizedText>>,
    opts: { rows?: number; placeholder?: string; required?: boolean } = {},
  ) => (
    <div className="sm:col-span-2">
      <label className="block text-sm font-medium text-primary-800">
        {label}
        {isEdit && ` (${CONTENT_LOCALE_LABELS[activeLocale]})`}
      </label>
      {!isPrimaryTab && (
        <p className="mt-1 whitespace-pre-wrap rounded border border-primary-200 bg-primary-50 px-2 py-1 text-xs text-primary-700">
          {value[primaryLocale] || (
            <span className="italic text-primary-500">(empty)</span>
          )}
        </p>
      )}
      {opts.rows ? (
        <textarea
          value={value[activeLocale] ?? ""}
          onChange={(e) => setLocalized(setter, e.target.value)}
          className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          rows={opts.rows}
          placeholder={opts.placeholder}
        />
      ) : (
        <input
          type="text"
          value={value[activeLocale] ?? ""}
          onChange={(e) => setLocalized(setter, e.target.value)}
          className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder={opts.placeholder}
          required={opts.required && isPrimaryTab}
        />
      )}
    </div>
  );

  return (
    <AppModal
      open={open}
      type={mode}
      onClose={onClose}
      title={isEdit ? "Edit Lesson" : "Add Lesson"}
      footer={
        <AppButton
          type="submit"
          disabled={!canSubmit || submitting}
          variant={isEdit ? AppButtonVariant.Edit : AppButtonVariant.Add}
          form="lessonForm"
        >
          {submitting ? "Saving..." : isEdit ? "Save" : "Add"}
        </AppButton>
      }
    >
      <form id="lessonForm" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Creating is not a translation task: a new lesson is written in
              the course's language and shows no language UI at all. */}
          {isEdit && (
            <div className="sm:col-span-2">
              <LocaleTabs
                languages={languages}
                active={activeLocale}
                defaultLanguage={primaryLocale}
                onChange={setActiveLocale}
                onAdd={addLocale}
                onRemove={removeLocale}
              />
              <p className="mt-2 text-xs text-primary-600">
                {isPrimaryTab
                  ? `${primaryLabel} is this course's primary language — its text and block structure are what every translation follows.`
                  : `Leave a field blank to inherit the ${primaryLabel} text. Leave the title blank and this language is not written at all.`}
              </p>
            </div>
          )}

          {localizedField("Title", title, setTitle, {
            placeholder: "Who is Jesus?",
            required: true,
          })}

          {localizedField(
            "Short Description",
            shortDescription,
            setShortDescription,
            { rows: 2, placeholder: "Where the whole story starts." },
          )}

          {isPrimaryTab && (
            <>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-primary-800">
                  Estimated Minutes
                  {autoEstimate && (
                    <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                      auto
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  min={0}
                  value={estimatedMinutes}
                  onChange={(e) => {
                    setEstimatedMinutes(e.target.value);
                    setAutoEstimate(false);
                  }}
                  className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />

                {suggestionDiffers && (
                  <button
                    type="button"
                    onClick={() => setAutoEstimate(true)}
                    className="mt-1 text-xs font-medium text-primary-700 underline underline-offset-2 hover:text-primary-900"
                  >
                    Suggested: {estimate.minutes} min — use
                  </button>
                )}

                <p className="mt-1 text-xs text-primary-600">
                  {autoEstimate
                    ? `Calculated from the ${primaryLabel} content below — edit the number to override.`
                    : "Hidden in the app when 0."}
                </p>

                {estimate.totalSeconds > 0 && (
                  <p className="mt-1 text-xs text-primary-600">
                    Text {formatDuration(estimate.textSeconds)}
                    {estimate.mediaSeconds > 0 &&
                      ` · Media ${formatDuration(estimate.mediaSeconds)}`}
                    {estimate.visualSeconds > 0 &&
                      ` · Images ${formatDuration(estimate.visualSeconds)}`}
                  </p>
                )}

                {estimate.blocksMissingDuration > 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    {estimate.blocksMissingDuration} audio/video block
                    {estimate.blocksMissingDuration === 1 ? " has" : "s have"} no
                    length set, so the estimate is low.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-primary-800">
                  Author
                </label>
                <select
                  value={authorId}
                  onChange={(e) => setAuthorId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">No author</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-primary-800">
                  Hero Image (optional)
                </label>
                <div className="mt-1 flex flex-col gap-2">
                  <FileUploadButton
                    label={uploading ? "Uploading..." : "Upload Image"}
                    accept="image/*"
                    disabled={uploading}
                    onSelect={async (f) => {
                      try {
                        setUploading(true);
                        const url = await uploadLessonImage(
                          f,
                          title[primaryLocale] || "lesson",
                        );
                        setImageUrl(url);
                        toast.success("Image uploaded");
                      } catch {
                        toast.error("Image upload failed");
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="https://..."
                  />
                  {imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt="preview"
                      className="h-20 w-full rounded border object-cover"
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {localizedField("Label (optional)", category, setCategory, {
            placeholder: "Free-form, not the course category",
          })}

          <LessonContentBlocksEditor
            items={blocks}
            onChange={setBlocks}
            locale={activeLocale}
            defaultLocale={primaryLocale}
            lessonTitle={title[primaryLocale]}
          />

          {contentIssues.length > 0 && !pristine && (
            <div className="sm:col-span-2 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-medium text-red-800">
                Fix before saving:
              </p>
              <ul className="mt-1 list-disc pl-4 text-xs text-red-700">
                {contentIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {localizedField(
            "Tags (comma separated)",
            tagsText,
            setTagsText,
            { placeholder: "faith, basics" },
          )}
        </div>
      </form>
    </AppModal>
  );
}

/** Removes one language from a block, leaving its structure untouched. */
function clearLocale(
  block: LessonFormBlock,
  locale: ContentLocale,
): LessonFormBlock {
  const without = (value: LocalizedText | undefined) => {
    if (!value) return value;
    const next = { ...value };
    delete next[locale];
    return next;
  };

  switch (block.type) {
    case LessonContentType.Banner:
      return block;
    case LessonContentType.Quote:
      return {
        type: block.type,
        value: { ...block.value, text: without(block.value.text)! },
      };
    case LessonContentType.Video:
    case LessonContentType.Audio:
      return {
        type: block.type,
        value: {
          ...block.value,
          title: without(block.value.title),
          caption: without(block.value.caption),
        },
      } as LessonFormBlock;
    default:
      return { type: block.type, value: without(block.value)! };
  }
}
