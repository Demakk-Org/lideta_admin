"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import AppModal from "@/components/ui/AppModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import DraggableList from "@/components/ui/DraggableList";
import FileUploadButton from "@/components/ui/FileUploadButton";
import { uploadCourseImage } from "@/lib/api/storage";
import {
  COURSE_AGE_GROUP_LABELS,
  COURSE_LEVEL_LABELS,
  CourseAgeGroup,
  CourseLevel,
  validatePrerequisites,
} from "@/lib/api/courses";
import type {
  CourseDoc,
  CourseWriteInput,
  PrerequisiteCandidate,
  WithId,
} from "@/lib/api/courses";
import type {
  CourseCategory,
  WithId as WithCategoryId,
} from "@/lib/api/courseCategories";

export default function CourseFormModal({
  open,
  mode,
  initial,
  categories,
  prerequisiteCandidates,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "add" | "edit";
  initial?: WithId<CourseDoc>;
  categories: WithCategoryId<CourseCategory>[];
  prerequisiteCandidates: PrerequisiteCandidate[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: CourseWriteInput) => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [ageGroup, setAgeGroup] = useState<CourseAgeGroup>(CourseAgeGroup.All);
  const [level, setLevel] = useState<CourseLevel>(CourseLevel.Beginner);
  const [sequential, setSequential] = useState(true);
  const [prerequisiteIds, setPrerequisiteIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setCoverImageUrl(initial?.coverImageUrl ?? "");
    setCategoryId(initial?.categoryId ?? "");
    setAgeGroup(initial?.ageGroup ?? CourseAgeGroup.All);
    setLevel(initial?.level ?? CourseLevel.Beginner);
    setSequential(initial?.sequential ?? true);
    setPrerequisiteIds(initial?.prerequisiteCourseIds ?? []);
  }, [open, initial]);

  const isEdit = mode === "edit";

  const candidateById = useMemo(
    () => new Map(prerequisiteCandidates.map((c) => [c.id, c])),
    [prerequisiteCandidates],
  );

  const selectedPrerequisites = useMemo(
    () =>
      prerequisiteIds.map((id) => ({
        id,
        title: candidateById.get(id)?.title || id,
        // An id that no longer resolves renders as nothing in the app.
        missing: !candidateById.has(id),
      })),
    [prerequisiteIds, candidateById],
  );

  // Only published courses can be prerequisites, and a course can't require
  // itself — so neither is offered.
  const availablePrerequisites = useMemo(
    () =>
      prerequisiteCandidates.filter(
        (c) =>
          c.status === "published" &&
          c.id !== initial?.id &&
          !prerequisiteIds.includes(c.id),
      ),
    [prerequisiteCandidates, initial?.id, prerequisiteIds],
  );

  const prerequisiteIssues = useMemo(
    () =>
      prerequisiteIds.length
        ? validatePrerequisites(
            initial?.id ?? null,
            prerequisiteIds,
            prerequisiteCandidates,
          )
        : [],
    [prerequisiteIds, initial?.id, prerequisiteCandidates],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!title.trim()) throw new Error("Title is required");
      if (prerequisiteIssues.length) throw new Error(prerequisiteIssues[0]);
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        coverImageUrl: coverImageUrl.trim(),
        categoryId: categoryId.trim(),
        ageGroup,
        level,
        sequential,
        prerequisiteCourseIds: prerequisiteIds,
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
      title={isEdit ? "Edit Course" : "Add Course"}
      footer={
        <AppButton
          type="submit"
          disabled={!title.trim() || submitting || prerequisiteIssues.length > 0}
          variant={isEdit ? AppButtonVariant.Edit : AppButtonVariant.Add}
          form="courseForm"
        >
          {submitting ? "Saving..." : isEdit ? "Save" : "Add"}
        </AppButton>
      }
    >
      <form id="courseForm" onSubmit={handleSubmit} className="space-y-4">
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
              placeholder="Foundations of Faith"
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              rows={3}
              placeholder="An eight-lesson introduction."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-primary-800">
              Category
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.id}
                </option>
              ))}
              {isEdit &&
                categoryId &&
                !categories.some((c) => c.id === categoryId) && (
                  <option value={categoryId}>{categoryId} (missing)</option>
                )}
            </select>
            {categories.length === 0 && (
              <p className="mt-1 text-xs text-primary-600">
                No categories found in <code>course_categories</code>.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-primary-800">
              Age Group
            </label>
            <select
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value as CourseAgeGroup)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {(Object.keys(COURSE_AGE_GROUP_LABELS) as CourseAgeGroup[]).map(
                (k) => (
                  <option key={k} value={k}>
                    {COURSE_AGE_GROUP_LABELS[k]}
                  </option>
                ),
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-primary-800">
              Level
            </label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as CourseLevel)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {(Object.keys(COURSE_LEVEL_LABELS) as CourseLevel[]).map((k) => (
                <option key={k} value={k}>
                  {COURSE_LEVEL_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={sequential}
                onChange={(e) => setSequential(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-500"
              />
              <span>
                <span className="block text-sm font-medium text-primary-800">
                  Sequential lessons
                </span>
                <span className="block text-xs text-primary-600">
                  On: each lesson stays locked until the previous one is
                  complete. Off: members can open any lesson.
                </span>
              </span>
            </label>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">
              Prerequisites
            </label>
            <p className="text-xs text-primary-600">
              Courses to take first, shown in this order. Advisory only — the
              app surfaces the requirement but never blocks entry.
            </p>

            {selectedPrerequisites.length > 0 && (
              <DraggableList
                items={selectedPrerequisites}
                getKey={(p) => p.id}
                onReorder={(next) =>
                  setPrerequisiteIds(next.map((p) => p.id))
                }
                listClassName="mt-2 space-y-2"
                itemClassName="rounded-md border border-primary-200 bg-white p-3"
                handleAriaLabel="Drag to reorder prerequisite"
                renderItem={(p, i) => (
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 text-sm text-primary-900">
                      <span className="mr-1 text-primary-500">{i + 1}.</span>
                      {p.title}
                      {p.missing && (
                        <span className="ml-1 text-xs text-red-700">
                          (missing — renders as nothing)
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPrerequisiteIds((ids) =>
                          ids.filter((id) => id !== p.id),
                        )
                      }
                      className="shrink-0 rounded-md border border-primary-300 bg-white px-2 py-1 text-xs text-primary-700 hover:bg-primary-50"
                    >
                      Remove
                    </button>
                  </div>
                )}
              />
            )}

            <select
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (id) setPrerequisiteIds((ids) => [...ids, id]);
              }}
              className="mt-2 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Add a prerequisite...</option>
              {availablePrerequisites.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || c.id}
                </option>
              ))}
            </select>
            {availablePrerequisites.length === 0 && (
              <p className="mt-1 text-xs text-primary-600">
                No other published course is available to add.
              </p>
            )}

            {prerequisiteIssues.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 rounded-md border border-red-200 bg-red-50 p-2 pl-6 text-xs text-red-800">
                {prerequisiteIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">
              Cover Image (16:9)
            </label>
            <div className="mt-1 flex flex-col gap-2">
              <FileUploadButton
                label={uploading ? "Uploading..." : "Upload Cover"}
                accept="image/*"
                disabled={uploading}
                onSelect={async (f) => {
                  try {
                    setUploading(true);
                    const url = await uploadCourseImage(f, title || "course");
                    setCoverImageUrl(url);
                    toast.success("Cover uploaded");
                  } catch {
                    toast.error("Cover upload failed");
                  } finally {
                    setUploading(false);
                  }
                }}
              />
              <input
                type="url"
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="https://..."
              />
              {coverImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverImageUrl}
                  alt="cover preview"
                  className="h-24 w-full rounded border object-cover"
                />
              )}
            </div>
          </div>

          {isEdit && (
            <div className="sm:col-span-2 rounded-md border border-primary-200 bg-primary-50 p-3 text-xs text-primary-700">
              Lessons: {initial?.lessonCount ?? 0} published · Final quiz:{" "}
              {initial?.hasFinalQuiz ? "yes" : "no"} · Status: {initial?.status}
              {initial?.createdAt && (
                <>
                  {" "}
                  · Created:{" "}
                  {new Date(initial.createdAt).toLocaleDateString()} (catalog
                  sort key — never re-stamped)
                </>
              )}
            </div>
          )}
        </div>
      </form>
    </AppModal>
  );
}
