"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import AppModal from "@/components/ui/AppModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import DraggableList from "@/components/ui/DraggableList";
import {
  QUESTION_TYPE_LABELS,
  QuestionType,
  addQuestion,
  deleteQuestion,
  listQuestions,
  reorderQuestions,
  updateQuestion,
} from "@/lib/api/questions";
import type {
  QuestionDoc,
  QuestionWriteInput,
  VerseReference,
} from "@/lib/api/questions";
import { QuizKind } from "@/lib/api/quizzes";
import QuestionFormModal from "./QuestionFormModal";

function trueFalseLabel(id: number | null): string {
  if (id === 1) return "True";
  if (id === 0) return "False";
  return "—";
}

function referenceVerseText(v: VerseReference | null): string | null {
  if (!v) return null;
  const base = `Book ${v.book} : ${v.chapter}`;
  if (v.verses && v.verses.length) return `${base}:${v.verses.join(",")}`;
  if (v.verse != null && v.toVerse != null) return `${base}:${v.verse}-${v.toVerse}`;
  if (v.verse != null) return `${base}:${v.verse}`;
  return base;
}

function summarize(q: QuestionDoc): string {
  switch (q.questionType) {
    case QuestionType.TrueFalse:
      return `Answer: ${trueFalseLabel(q.correctOptionId)}`;
    case QuestionType.MultipleChoice: {
      const correct =
        q.correctOptionId != null && q.options[q.correctOptionId]
          ? q.options[q.correctOptionId]
          : "—";
      return `${q.options.length} options · Correct: ${correct}`;
    }
    case QuestionType.ShortAnswer:
      return `Expected: ${q.answerText ?? "—"}`;
  }
}

export default function QuestionsModal({
  open,
  quizId,
  quizTitle,
  quizKind,
  onClose,
  onCountChange,
}: {
  open: boolean;
  quizId: string | null;
  quizTitle?: string;
  quizKind?: QuizKind;
  onClose: () => void;
  onCountChange?: (quizId: string, count: number) => void;
}) {
  // Lesson and course quizzes throw in the app on short_answer.
  const allowedTypes =
    quizKind === QuizKind.Lesson || quizKind === QuizKind.Course
      ? [QuestionType.MultipleChoice, QuestionType.TrueFalse]
      : undefined;
  const [items, setItems] = useState<QuestionDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editing, setEditing] = useState<QuestionDoc | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);

  const refresh = useCallback(async () => {
    if (!quizId) return;
    setLoading(true);
    try {
      const list = await listQuestions(quizId);
      setItems(list);
      onCountChangeRef.current?.(quizId, list.length);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load questions";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    if (open && quizId) {
      void refresh();
    } else {
      setItems([]);
    }
  }, [open, quizId, refresh]);

  const openAdd = () => {
    setFormMode("add");
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (q: QuestionDoc) => {
    setFormMode("edit");
    setEditing(q);
    setFormOpen(true);
  };

  const handleSubmit = async (payload: QuestionWriteInput) => {
    if (!quizId || submitting) return;
    setSubmitting(true);
    try {
      if (formMode === "edit" && editing) {
        await updateQuestion(quizId, editing.id, payload);
        toast.success("Question updated");
      } else {
        await addQuestion(quizId, payload);
        toast.success("Question added");
      }
      setFormOpen(false);
      setEditing(null);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReorder = async (next: QuestionDoc[]) => {
    if (!quizId || savingOrder) return;
    setItems(next.map((q, i) => ({ ...q, order: i })));
    setSavingOrder(true);
    try {
      await reorderQuestions(
        quizId,
        next.map((q) => q.id),
      );
    } catch {
      toast.error("Reorder failed");
      void refresh();
    } finally {
      setSavingOrder(false);
    }
  };

  const confirmDelete = async () => {
    if (!quizId || !deleteId || deleting) return;
    setDeleting(true);
    try {
      await deleteQuestion(quizId, deleteId);
      toast.success("Question deleted");
      setDeleteId(null);
      await refresh();
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <AppModal
        open={open}
        type="edit"
        onClose={onClose}
        title={quizTitle ? `Questions — ${quizTitle}` : "Questions"}
        footer={
          <AppButton variant={AppButtonVariant.Add} onClick={openAdd}>
            Add Question
          </AppButton>
        }
      >
        <div className="space-y-3">
          {loading && (
            <p className="text-sm text-primary-600">Loading questions...</p>
          )}
          {!loading && items.length === 0 && (
            <p className="text-sm text-primary-600">
              No questions yet. Click <em>Add Question</em> to create one.
            </p>
          )}
          {!loading && items.length > 0 && (
            <DraggableList
              items={items}
              getKey={(q) => q.id}
              onReorder={handleReorder}
              listClassName="space-y-3"
              itemClassName="rounded-md border border-primary-200 bg-white p-3"
              handleAriaLabel="Drag to reorder question"
              renderItem={(q, idx) => (
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-primary-600">
                        #{idx + 1} ·{" "}
                        {QUESTION_TYPE_LABELS[q.questionType]}
                      </p>
                      <p className="mt-1 text-sm font-medium text-primary-900 break-words">
                        {q.text}
                      </p>
                      <p className="mt-1 text-xs text-primary-700">
                        {summarize(q)}
                      </p>
                      {referenceVerseText(q.referenceVerse) && (
                        <p className="mt-1 text-[11px] text-primary-600">
                          Ref: {referenceVerseText(q.referenceVerse)}
                        </p>
                      )}
                      {q.explanation && (
                        <p className="mt-1 text-[11px] text-primary-600">
                          Explanation: {q.explanation}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <AppButton
                        variant={AppButtonVariant.Edit}
                        className="px-2 py-1 text-xs"
                        onClick={() => openEdit(q)}
                      >
                        Edit
                      </AppButton>
                      <AppButton
                        variant={AppButtonVariant.Delete}
                        className="px-2 py-1 text-xs"
                        onClick={() => setDeleteId(q.id)}
                      >
                        Delete
                      </AppButton>
                    </div>
                  </div>
                </div>
              )}
            />
          )}
          {savingOrder && (
            <p className="text-xs text-primary-600">Saving order...</p>
          )}
        </div>
      </AppModal>

      <QuestionFormModal
        open={formOpen}
        mode={formMode}
        initial={editing ?? undefined}
        defaultOrder={items.length}
        allowedTypes={allowedTypes}
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
