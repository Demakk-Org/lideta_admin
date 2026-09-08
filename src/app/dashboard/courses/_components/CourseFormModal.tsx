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
import LocaleTabs from "@/components/ui/LocaleTabs";
import {
  BASE_CONTENT_LOCALE,
  CONTENT_LOCALE_LABELS,
} from "@/lib/i18n/contentLocales";
import type { ContentLocale } from "@/lib/i18n/contentLocales";
import { displayText, localesOf } from "@/lib/i18n/localizedText";
import type { LocalizedText } from "@/lib/i18n/localizedText";

export default function CourseFormModal({
  open,
  mode,
  initial,
  addLanguage,
  categories,
  prerequisiteCandidates,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "add" | "edit";
  initial?: WithId<CourseDoc>;
  /** Opens the modal on this language, adding a tab for it. */
  addLanguage?: ContentLocale;
  categories: WithCategoryId<CourseCategory>[];
  prerequisiteCandidates: PrerequisiteCandidate[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: CourseWriteInput) => Promise<void> | void;
}) {
  const [title, setTitle] = useState<LocalizedText>({});
  const [description, setDescription] = useState<LocalizedText>({});
  /** Tabs that exist on this document — not every language there is. */
  const [languages, setLanguages] = useState<ContentLocale[]>([
    BASE_CONTENT_LOCALE,
  ]);
  const [activeLocale, setActiveLocale] =
    useState<ContentLocale>(BASE_CONTENT_LOCALE);
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [ageGroup, setAgeGroup] = useState<CourseAgeGroup>(CourseAgeGroup.All);
  const [level, setLevel] = useState<CourseLevel>(CourseLevel.Beginner);
  const [sequential, setSequential] = useState(true);
  const [prerequisiteIds, setPrerequisiteIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const seededTitle = initial?.title ?? {};
    const present = localesOf(seededTitle);
    const primary = initial?.defaultLanguage ?? BASE_CONTENT_LOCALE;
    // `addLanguage` is the list view's `+`: open straight onto the new tab,
    // with the fields empty and the primary text alongside as reference.
    const open2 =
      addLanguage && !present.includes(addLanguage)
        ? [...present, addLanguage]
        : present;

    setTitle(seededTitle);
    setDescription(initial?.description ?? {});
    setLanguages(open2.length ? open2 : [primary]);
    setActiveLocale(addLanguage ?? primary);
    setCoverImageUrl(initial?.coverImageUrl ?? "");
    setCategoryId(initial?.categoryId ?? "");
    setAgeGroup(initial?.ageGroup ?? CourseAgeGroup.All);
    setLevel(initial?.level ?? CourseLevel.Beginner);
    setSequential(initial?.sequential ?? true);
    setPrerequisiteIds(initial?.prerequisiteCourseIds ?? []);
  }, [open, initial, addLanguage]);

  const isEdit = mode === "edit";

  // The primary language is the first tab: what every other language falls
  // back to, and the only tab that shows the non-translatable fields.
  const primaryLocale = languages[0] ?? BASE_CONTENT_LOCALE;
  const isPrimaryTab = activeLocale === primaryLocale;

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
    setDescription(drop);
    setActiveLocale(primaryLocale);
  };

  // A language is carried only once it has a title. An empty tab is dropped on
  // save rather than written as `{ am: "" }`, which would list the course under
  // Amharic and then render a blank card.
  const titled = localesOf(title).filter((l) => (title[l] ?? "").trim());

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
      if (!titled.length) {
        throw new Error(
          `Title is required in ${CONTENT_LOCALE_LABELS[primaryLocale]}`,
        );
      }
      if (prerequisiteIssues.length) throw new Error(prerequisiteIssues[0]);
      await onSubmit({
        // Blank languages are dropped by the write layer, so the rule lives in
        // one place rather than in every form.
        title,
        description,
        defaultLanguage: titled.includes(primaryLocale)
          ? primaryLocale
          : titled[0],
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
          disabled={!titled.length || submitting || prerequisiteIssues.length > 0}
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
            {/* Creating is not a translation task: a new course is English and
                shows no language UI at all. The tabs appear once it exists. */}
            {isEdit && (
              <LocaleTabs
                languages={languages}
                active={activeLocale}
                defaultLanguage={primaryLocale}
                onChange={setActiveLocale}
                onAdd={addLocale}
                onRemove={removeLocale}
              />
            )}
            <div
              className={
                isEdit
                  ? "rounded-b-md rounded-tr-md border border-t-0 border-primary-200 p-3"
                  : ""
              }
            >
              <label className="block text-sm font-medium text-primary-800">
                Title{isEdit && ` (${CONTENT_LOCALE_LABELS[activeLocale]})`}
              </label>
              {!isPrimaryTab && (
                <p className="mt-1 whitespace-pre-wrap rounded border border-primary-200 bg-primary-50 px-2 py-1 text-xs text-primary-700">
                  {title[primaryLocale] || (
                    <span className="italic text-primary-500">(empty)</span>
                  )}
                </p>
              )}
              <input
                type="text"
                value={title[activeLocale] ?? ""}
                onChange={(e) => setLocalized(setTitle, e.target.value)}
                className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Foundations of Faith"
                required={isPrimaryTab}
              />

              <label className="mt-3 block text-sm font-medium text-primary-800">
                Description{isEdit && ` (${CONTENT_LOCALE_LABELS[activeLocale]})`}
              </label>
              {!isPrimaryTab && (
                <p className="mt-1 whitespace-pre-wrap rounded border border-primary-200 bg-primary-50 px-2 py-1 text-xs text-primary-700">
                  {description[primaryLocale] || (
                    <span className="italic text-primary-500">(empty)</span>
                  )}
                </p>
              )}
              <textarea
                value={description[activeLocale] ?? ""}
                onChange={(e) => setLocalized(setDescription, e.target.value)}
                className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                rows={3}
                placeholder="An eight-lesson introduction."
              />

              {!isPrimaryTab && (
                <p className="mt-2 text-xs text-primary-600">
                  Leave the title empty and this language is not written at all —
                  the course simply is not offered in it.
                </p>
              )}
            </div>
          </div>

          {isPrimaryTab && (
            <>
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
                  {displayText(c.name) || c.id}
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
                    const url = await uploadCourseImage(
                      f,
                      title[primaryLocale] || "course",
                    );
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

            </>
          )}

          {isEdit && isPrimaryTab && (
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
