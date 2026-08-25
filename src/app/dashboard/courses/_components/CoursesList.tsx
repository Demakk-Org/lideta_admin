"use client";

import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import {
  COURSE_AGE_GROUP_LABELS,
  COURSE_LEVEL_LABELS,
} from "@/lib/api/courses";
import type { CourseDoc, WithId } from "@/lib/api/courses";

export default function CoursesList({
  items,
  categoryLookup,
  lessonCounts,
  publishingId,
  onEdit,
  onDelete,
  onPublish,
  onUnpublish,
  onOpenLessons,
}: {
  items: WithId<CourseDoc>[];
  categoryLookup: Record<string, string>;
  lessonCounts: Record<string, { total: number; published: number }>;
  publishingId: string | null;
  onEdit: (it: WithId<CourseDoc>) => void;
  onDelete: (id: string) => void;
  onPublish: (it: WithId<CourseDoc>) => void;
  onUnpublish: (it: WithId<CourseDoc>) => void;
  onOpenLessons: (it: WithId<CourseDoc>) => void;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => {
        const counts = lessonCounts[it.id] ?? { total: 0, published: 0 };
        // lessonCount is denormalized on the course; drift is worth showing.
        const countStale = counts.published !== it.lessonCount;
        return (
          <div
            key={it.id}
            className="rounded-md border border-primary-200 bg-white p-4 shadow-sm"
          >
            {it.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={it.coverImageUrl}
                alt=""
                className="mb-3 aspect-video w-full rounded object-cover"
              />
            ) : null}

            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-primary-900">
                  {it.title}
                </h3>
                {it.categoryId && (
                  <p className="text-xs text-primary-600">
                    {categoryLookup[it.categoryId] ?? it.categoryId}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${
                  it.status === "published"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {it.status === "published" ? "Published" : "Draft"}
              </span>
            </div>

            {it.description && (
              <p className="mt-2 line-clamp-2 text-sm text-primary-800">
                {it.description}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
              <span className="inline-block rounded bg-primary-50 px-2 py-0.5 text-primary-700">
                Age: {COURSE_AGE_GROUP_LABELS[it.ageGroup]}
              </span>
              <span className="inline-block rounded bg-primary-50 px-2 py-0.5 text-primary-700">
                Level: {COURSE_LEVEL_LABELS[it.level]}
              </span>
              <span className="inline-block rounded bg-primary-50 px-2 py-0.5 text-primary-700">
                {it.sequential ? "Sequential" : "Open"}
              </span>
              {it.prerequisiteCourseIds.length > 0 && (
                <span className="inline-block rounded bg-primary-50 px-2 py-0.5 text-primary-700">
                  Prerequisites: {it.prerequisiteCourseIds.length}
                </span>
              )}
              {it.hasFinalQuiz && (
                <span className="inline-block rounded bg-indigo-100 px-2 py-0.5 text-indigo-800">
                  Final quiz
                </span>
              )}
            </div>

            <p className="mt-2 text-xs text-primary-600">
              Lessons: {counts.published} published / {counts.total} total
              {countStale && (
                <span className="ml-1 text-amber-700">
                  (card says {it.lessonCount})
                </span>
              )}
            </p>
            {/* The catalog is newest-first on createdAt, so it is worth seeing. */}
            <p className="mt-1 text-xs text-primary-600">
              Created: {new Date(it.createdAt).toLocaleDateString()}
            </p>
            <p className="mt-1 break-all text-[11px] text-primary-500">
              id: {it.id}
            </p>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onOpenLessons(it)}
                className="inline-flex items-center gap-1 rounded-md border border-primary-300 bg-white px-3 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50"
              >
                Lessons
                <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">
                  {counts.total}
                </span>
              </button>
              <div className="flex gap-2">
                {it.status === "published" ? (
                  <button
                    type="button"
                    onClick={() => onUnpublish(it)}
                    disabled={publishingId === it.id}
                    className="rounded-md border border-gray-400 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Unpublish
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onPublish(it)}
                    disabled={publishingId === it.id}
                    className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {publishingId === it.id ? "Checking..." : "Publish"}
                  </button>
                )}
                <AppButton
                  variant={AppButtonVariant.Edit}
                  className="px-3 py-1 text-xs"
                  onClick={() => onEdit(it)}
                >
                  Edit
                </AppButton>
                <AppButton
                  variant={AppButtonVariant.Delete}
                  className="px-3 py-1 text-xs"
                  onClick={() => onDelete(it.id)}
                >
                  Delete
                </AppButton>
              </div>
            </div>
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="col-span-full py-8 text-center text-primary-600">
          No courses yet.
        </div>
      )}
    </div>
  );
}
