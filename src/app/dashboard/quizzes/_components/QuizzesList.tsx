"use client";

import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import { EmptyGrid } from "@/components/ui/PagedGridPage";
import {
  AGE_GROUP_LABELS,
  DIFFICULTY_LEVEL_LABELS,
  QUIZ_KIND_LABELS,
  QuizKind,
} from "@/lib/api/quizzes";
import type { QuizDoc, WithId } from "@/lib/api/quizzes";

function categoryName(id: string, lookup: Record<string, string>) {
  if (!id) return null;
  return lookup[id] ?? id;
}

function formatDate(v: string) {
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d.toLocaleString();
  return v;
}

export default function QuizzesList({
  items,
  categoryLookup,
  questionCounts,
  publishingId,
  onEdit,
  onDelete,
  onPublish,
  onOpenQuestions,
}: {
  items: WithId<QuizDoc>[];
  categoryLookup: Record<string, string>;
  questionCounts: Record<string, number>;
  publishingId: string | null;
  onEdit: (it: WithId<QuizDoc>) => void;
  onDelete: (id: string) => void;
  onPublish: (it: WithId<QuizDoc>) => void;
  onOpenQuestions: (it: WithId<QuizDoc>) => void;
}) {
  if (items.length === 0) return <EmptyGrid>No quizzes yet.</EmptyGrid>;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
      {items.map((it) => (
        <div
          key={it.id}
          className="rounded-md border border-primary-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-primary-900">
                {it.title}
              </h3>
              {categoryName(it.categoryId, categoryLookup) && (
                <p className="text-xs text-primary-600">
                  {categoryName(it.categoryId, categoryLookup)}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                  it.kind === QuizKind.Daily
                    ? "bg-amber-100 text-amber-800"
                    : it.kind === QuizKind.Study
                      ? "bg-sky-100 text-sky-800"
                      : it.kind === QuizKind.Lesson
                        ? "bg-violet-100 text-violet-800"
                        : it.kind === QuizKind.Course
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-primary-100 text-primary-700"
                }`}
              >
                {QUIZ_KIND_LABELS[it.kind]}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                  it.isPublished
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {it.isPublished ? "Published" : "Draft"}
              </span>
            </div>
          </div>
          {it.description && (
            <p className="mt-2 text-sm text-primary-800">{it.description}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
            <span className="inline-block rounded bg-primary-50 px-2 py-0.5 text-primary-700">
              Age: {AGE_GROUP_LABELS[it.ageGroup]}
            </span>
            <span className="inline-block rounded bg-primary-50 px-2 py-0.5 text-primary-700">
              Difficulty: {DIFFICULTY_LEVEL_LABELS[it.dificultyLevel]}
            </span>
            {it.kind === QuizKind.Daily && (
              <span className="inline-block rounded bg-primary-50 px-2 py-0.5 text-primary-700">
                Verse read: {it.requiresVerseRead ? "Required" : "Not required"}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-primary-600">
            Created: {formatDate(it.createdAt)}
          </p>
          <p className="mt-1 break-all text-[11px] text-primary-500">
            id: {it.id}
          </p>
          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onOpenQuestions(it)}
              className="inline-flex items-center gap-1 rounded-md border border-primary-300 bg-white px-3 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50"
            >
              Questions
              <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">
                {questionCounts[it.id] ?? "—"}
              </span>
            </button>
            <div className="flex gap-2">
              {!it.isPublished &&
                (() => {
                  const count = questionCounts[it.id];
                  const isCountKnown = count != null;
                  const hasQuestions = isCountKnown && count > 0;
                  const isPublishing = publishingId === it.id;
                  return (
                    <button
                      type="button"
                      onClick={() => onPublish(it)}
                      disabled={isPublishing || !hasQuestions}
                      title={
                        !isCountKnown
                          ? "Loading question count..."
                          : count === 0
                            ? "Add at least one question before publishing"
                            : undefined
                      }
                      className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPublishing ? "Publishing..." : "Publish"}
                    </button>
                  );
                })()}
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
      ))}
    </div>
  );
}
