"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import AppModal from "@/components/ui/AppModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import DraggableList from "@/components/ui/DraggableList";
import { useAppDispatch, useAppSelector } from "@/lib/redux/store";
import {
  changeLessonStatus,
  createLesson,
  editLesson,
  reestimateLesson,
  removeLesson,
  reorderLessonsThunk,
} from "@/lib/redux/features/lessonsSlice";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { LessonContentType } from "@/lib/api/lessons";
import type { LessonDoc, LessonWriteInput, WithId } from "@/lib/api/lessons";
import LessonFormModal from "./LessonFormModal";

function blockSummary(lesson: WithId<LessonDoc>): string {
  if (lesson.content.length === 0) return "no content";
  const counts = new Map<LessonContentType, number>();
  for (const b of lesson.content) {
    counts.set(b.type, (counts.get(b.type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, n]) => `${n} ${type}`).join(" · ");
}

export default function LessonsModal({
  open,
  courseId,
  courseTitle,
  onClose,
}: {
  open: boolean;
  courseId: string | null;
  courseTitle?: string;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const allLessons = useAppSelector((s) => s.lessons.items);
  const users = useAppSelector((s) => s.users.items);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editing, setEditing] = useState<WithId<LessonDoc> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const lessons = useMemo(
    () =>
      courseId
        ? allLessons
            .filter((l) => l.courseId === courseId)
            .slice()
            .sort((a, b) => a.order - b.order)
        : [],
    [allLessons, courseId],
  );

  /**
   * Position for the next lesson. Taken from the highest order in use rather
   * than the lesson count, which collides whenever the existing orders have a
   * gap (1, 3, 4 would put a fourth lesson at 4). The form no longer exposes
   * the number, so a collision here is not something an admin can correct.
   */
  const nextOrder = useMemo(
    () => lessons.reduce((max, l) => Math.max(max, l.order), 0) + 1,
    [lessons],
  );

  const duplicateOrders = useMemo(() => {
    const seen = new Set<number>();
    const dupes = new Set<number>();
    for (const l of lessons) {
      if (seen.has(l.order)) dupes.add(l.order);
      seen.add(l.order);
    }
    return dupes;
  }, [lessons]);

  const handleSubmit = async (payload: LessonWriteInput) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (formMode === "edit" && editing) {
        await dispatch(editLesson({ id: editing.id, data: payload })).unwrap();
        toast.success("Lesson updated");
      } else {
        await dispatch(createLesson(payload)).unwrap();
        toast.success("Lesson added");
      }
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const togglePublish = async (lesson: WithId<LessonDoc>) => {
    if (busyId) return;
    setBusyId(lesson.id);
    try {
      await dispatch(
        changeLessonStatus({
          id: lesson.id,
          courseId: lesson.courseId,
          status: lesson.status === "published" ? "draft" : "published",
        }),
      ).unwrap();
      toast.success(
        lesson.status === "published" ? "Lesson unpublished" : "Lesson published",
      );
    } catch {
      toast.error("Status change failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleReestimate = async (lesson: WithId<LessonDoc>) => {
    if (busyId) return;
    setBusyId(lesson.id);
    try {
      const { before, after } = await dispatch(
        reestimateLesson({ id: lesson.id, courseId: lesson.courseId }),
      ).unwrap();
      toast.success(
        before === after
          ? `Estimate unchanged at ${after} min`
          : `Estimate updated: ${before} → ${after} min`,
      );
    } catch {
      toast.error("Re-estimate failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleReorder = async (next: WithId<LessonDoc>[]) => {
    if (!courseId) return;
    try {
      await dispatch(
        reorderLessonsThunk({ courseId, orderedIds: next.map((l) => l.id) }),
      ).unwrap();
    } catch {
      toast.error("Reorder failed");
    }
  };

  const confirmDelete = async () => {
    if (!deleteId || deleting) return;
    setDeleting(true);
    try {
      const lesson = lessons.find((l) => l.id === deleteId);
      await dispatch(
        removeLesson({ id: deleteId, courseId: lesson?.courseId ?? "" }),
      ).unwrap();
      toast.success("Lesson deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  return (
    <>
      <AppModal
        open={open}
        type="edit"
        onClose={onClose}
        title={courseTitle ? `Lessons — ${courseTitle}` : "Lessons"}
        footer={
          <AppButton
            variant={AppButtonVariant.Add}
            onClick={() => {
              setFormMode("add");
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add Lesson
          </AppButton>
        }
      >
        <div className="space-y-3">
          {lessons.length === 0 && (
            <p className="text-sm text-primary-600">
              No lessons yet. Click <em>Add Lesson</em> to create the first one.
            </p>
          )}

          {duplicateOrders.size > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              Duplicate order values ({[...duplicateOrders].join(", ")}). Drag to
              renumber before publishing.
            </p>
          )}

          {lessons.length > 0 && (
            <DraggableList
              items={lessons}
              getKey={(l) => l.id}
              onReorder={handleReorder}
              listClassName="space-y-3"
              itemClassName="rounded-md border border-primary-200 bg-white p-3"
              handleAriaLabel="Drag to reorder lesson"
              renderItem={(l) => (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-primary-600">
                      #{l.order} ·{" "}
                      <span
                        className={
                          l.status === "published"
                            ? "text-emerald-700"
                            : "text-gray-600"
                        }
                      >
                        {l.status}
                      </span>
                      {l.hasQuiz ? " · has quiz" : ""}
                      {" · "}
                      {l.estimatedMinutes} min
                      <button
                        type="button"
                        onClick={() => handleReestimate(l)}
                        disabled={busyId === l.id}
                        title="Recalculate the estimate from this lesson's content"
                        aria-label="Re-estimate reading time"
                        className="ml-1 inline-flex align-[-2px] rounded p-0.5 text-primary-500 hover:bg-primary-100 hover:text-primary-800 disabled:opacity-40"
                      >
                        <ArrowPathIcon
                          className={`h-3.5 w-3.5 ${
                            busyId === l.id ? "animate-spin" : ""
                          }`}
                        />
                      </button>
                    </p>
                    <p className="mt-1 text-sm font-medium text-primary-900 break-words">
                      {l.title || l.id}
                    </p>
                    {l.shortDescription && (
                      <p className="mt-1 text-xs text-primary-700">
                        {l.shortDescription}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-primary-600">
                      {blockSummary(l)}
                    </p>
                    <p className="mt-1 break-all text-[11px] text-primary-500">
                      id: {l.id}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => togglePublish(l)}
                      disabled={busyId === l.id}
                      className={`rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                        l.status === "published"
                          ? "border-gray-400 bg-white text-gray-700 hover:bg-gray-50"
                          : "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                      }`}
                    >
                      {l.status === "published" ? "Unpublish" : "Publish"}
                    </button>
                    <AppButton
                      variant={AppButtonVariant.Edit}
                      className="px-2 py-1 text-xs"
                      onClick={() => {
                        setFormMode("edit");
                        setEditing(l);
                        setFormOpen(true);
                      }}
                    >
                      Edit
                    </AppButton>
                    <AppButton
                      variant={AppButtonVariant.Delete}
                      className="px-2 py-1 text-xs"
                      onClick={() => setDeleteId(l.id)}
                    >
                      Delete
                    </AppButton>
                  </div>
                </div>
              )}
            />
          )}
        </div>
      </AppModal>

      <LessonFormModal
        open={formOpen}
        mode={formMode}
        courseId={courseId ?? ""}
        initial={editing ?? undefined}
        defaultOrder={nextOrder}
        users={users}
        submitting={submitting}
        onClose={() => {
          if (!submitting) {
            setFormOpen(false);
            setEditing(null);
          }
        }}
        onSubmit={handleSubmit}
      />

      <ConfirmDeleteModal
        open={!!deleteId}
        onCancel={() => {
          if (!deleting) setDeleteId(null);
        }}
        onConfirm={confirmDelete}
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        disabled={deleting}
      />
    </>
  );
}
