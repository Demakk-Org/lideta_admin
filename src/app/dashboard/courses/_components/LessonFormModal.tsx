"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import AppModal from "@/components/ui/AppModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import FileUploadButton from "@/components/ui/FileUploadButton";
import { uploadLessonImage } from "@/lib/api/storage";
import { LessonContentType, validateLessonContent } from "@/lib/api/lessons";
import type {
  LessonContentItem,
  LessonDoc,
  LessonWriteInput,
  WithId,
} from "@/lib/api/lessons";
import { estimateLesson, formatDuration } from "@/lib/api/lessonEstimate";
import type { UserDoc, WithId as WithUserId } from "@/lib/api/users";
import LessonContentBlocksEditor, {
  type LessonFormBlock,
} from "./LessonContentBlocksEditor";

function toFormBlocks(content: LessonContentItem[]): LessonFormBlock[] {
  return content.map((b) => {
    if (b.type === LessonContentType.List) {
      return { type: b.type, value: b.value.join("\n") };
    }
    return b as LessonFormBlock;
  });
}

function toContent(blocks: LessonFormBlock[]): LessonContentItem[] {
  return blocks.map((b) => {
    if (b.type === LessonContentType.List) {
      return {
        type: LessonContentType.List,
        value: b.value
          .split(/\r?\n/)
          .map((v) => v.trim())
          .filter(Boolean),
      };
    }
    return b as LessonContentItem;
  });
}

export default function LessonFormModal({
  open,
  mode,
  courseId,
  initial,
  defaultOrder,
  users,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "add" | "edit";
  courseId: string;
  initial?: WithId<LessonDoc>;
  defaultOrder: number;
  users: WithUserId<UserDoc>[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: LessonWriteInput) => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [category, setCategory] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("0");
  const [blocks, setBlocks] = useState<LessonFormBlock[]>([]);
  const [uploading, setUploading] = useState(false);
  /**
   * While true, the estimated minutes track the content on every edit. Typing
   * in the field turns it off; the suggestion chip turns it back on. It is
   * deliberately not persisted — a saved lesson reopens in manual mode showing
   * the number that was actually stored, with the suggestion one click away.
   */
  const [autoEstimate, setAutoEstimate] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setShortDescription(initial?.shortDescription ?? "");
    setAuthorId(initial?.author_id ?? "");
    setImageUrl(initial?.imageUrl ?? "");
    setCategory(initial?.category ?? "");
    setTagsText((initial?.tags ?? []).join(", "));
    setEstimatedMinutes(String(initial?.estimatedMinutes ?? 0));
    // A lesson always needs a block, so open with an empty paragraph rather
    // than an empty list — there is nothing useful to do with zero blocks.
    // It stays empty, so `validateLessonContent` still blocks submitting.
    const existing = toFormBlocks(initial?.content ?? []);
    setBlocks(
      existing.length > 0
        ? existing
        : [{ type: LessonContentType.Paragraph, value: "" }],
    );
    // A new lesson has no number worth preserving, so it starts on auto; an
    // existing one keeps whatever was saved until the admin accepts a change.
    setAutoEstimate(!initial);
  }, [open, initial, defaultOrder]);

  const isEdit = mode === "edit";
  const content = useMemo(() => toContent(blocks), [blocks]);
  const estimate = useMemo(() => estimateLesson(content), [content]);
  const contentIssues = validateLessonContent(content);
  const canSubmit =
    !!title.trim() && blocks.length > 0 && contentIssues.length === 0;

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
    !title.trim() &&
    blocks.length === 1 &&
    blocks[0].type === LessonContentType.Paragraph &&
    blocks[0].value === "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!title.trim()) throw new Error("Title is required");
      if (content.length === 0) {
        throw new Error("A lesson needs at least one content block");
      }
      const issues = validateLessonContent(content);
      if (issues.length) throw new Error(issues.join("\n"));

      await onSubmit({
        courseId,
        // Position is owned by the lessons list, which drag-and-drop rewrites
        // across the whole course. Editing a lesson must not move it, and a
        // new one goes on the end.
        order: initial?.order ?? defaultOrder,
        title: title.trim(),
        shortDescription: shortDescription.trim(),
        author_id: authorId.trim(),
        imageUrl: imageUrl.trim(),
        category: category.trim(),
        tags: tagsText
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        estimatedMinutes: Number(estimatedMinutes) || 0,
        content,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submit failed";
      toast.error(msg);
    }
  };

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
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Who is Jesus?"
              required
            />
          </div>

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
                ? "Calculated from the content below — edit the number to override."
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

          <div>
            <label className="block text-sm font-medium text-primary-800">
              Label (optional)
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Free-form, not the course category"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">
              Short Description
            </label>
            <textarea
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              rows={2}
              placeholder="Where the whole story starts."
            />
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
                    const url = await uploadLessonImage(f, title || "lesson");
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

          <LessonContentBlocksEditor
            items={blocks}
            onChange={setBlocks}
            lessonTitle={title}
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

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="faith, basics"
            />
          </div>
        </div>
      </form>
    </AppModal>
  );
}
