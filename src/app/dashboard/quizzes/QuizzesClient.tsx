"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/store";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import {
  createDailyQuiz,
  createStandardQuiz,
  editQuiz,
  fetchQuizzes,
  publishQuizThunk,
  removeQuiz,
} from "@/lib/redux/features/quizzesSlice";
import { fetchQuizCategories } from "@/lib/redux/features/quizCategoriesSlice";
import { QuizKind } from "@/lib/api/quizzes";
import type {
  CreateDailyQuizInput,
  CreateStandardQuizInput,
  QuizDoc,
  UpdateQuizInput,
  WithId,
} from "@/lib/api/quizzes";
import { countQuestions } from "@/lib/api/questions";
import QuizzesList from "./_components/QuizzesList";
import QuizFormModal from "./_components/QuizFormModal";
import QuestionsModal from "./_components/QuestionsModal";

type KindFilter = "all" | QuizKind.Standard | QuizKind.Daily;
type StatusFilter = "all" | "draft" | "published";

export default function QuizzesClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.quizzes);
  const catState = useAppSelector((s) => s.quizCategories);
  const loading = status === "loading";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [filter, setFilter] = useState<KindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const [questionsQuiz, setQuestionsQuiz] = useState<WithId<QuizDoc> | null>(null);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (status === "idle") dispatch(fetchQuizzes());
    if (catState.status === "idle") dispatch(fetchQuizCategories());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, catState.status]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.style.overflow = "";
    }
  }, []);

  // Fetch question counts for any quiz we don't already have a count for.
  useEffect(() => {
    const missing = items.filter((it) => questionCounts[it.id] == null);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        missing.map(async (it) => [it.id, await countQuestions(it.id)] as const),
      );
      if (cancelled) return;
      setQuestionCounts((prev) => {
        const next = { ...prev };
        for (const [id, count] of results) next[id] = count;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [items, questionCounts]);

  const categoryLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of catState.items) map[c.id] = c.name || c.id;
    return map;
  }, [catState.items]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (filter !== "all" && it.kind !== filter) return false;
      if (statusFilter === "draft" && it.isPublished) return false;
      if (statusFilter === "published" && !it.isPublished) return false;
      return true;
    });
  }, [items, filter, statusFilter]);

  const existingDailyDates = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.kind === QuizKind.Daily && it.id.startsWith("daily-")) {
        set.add(it.id.slice("daily-".length));
      }
    }
    return set;
  }, [items]);

  const editingItem = useMemo(
    () => (editingId ? items.find((x) => x.id === editingId) : undefined),
    [items, editingId],
  );

  const openAdd = () => {
    setModalType("add");
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (it: WithId<QuizDoc>) => {
    setModalType("edit");
    setEditingId(it.id);
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleCreateStandard = async (payload: CreateStandardQuizInput) => {
    await dispatch(createStandardQuiz(payload)).unwrap();
    toast.success("Quiz added");
    setIsModalOpen(false);
  };

  const handleCreateDaily = async (payload: CreateDailyQuizInput) => {
    await dispatch(createDailyQuiz(payload)).unwrap();
    toast.success("Daily quiz added");
    setIsModalOpen(false);
  };

  const handleEdit = async (id: string, payload: UpdateQuizInput) => {
    await dispatch(editQuiz({ id, data: payload })).unwrap();
    toast.success("Quiz updated");
    setIsModalOpen(false);
  };

  const onDelete = (id: string) => {
    setDeleteId(id);
    setIsDeleteOpen(true);
  };

  const handlePublish = async (it: WithId<QuizDoc>) => {
    if (publishingId) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Publish "${it.title}"? This cannot be undone from the admin.`,
      )
    ) {
      return;
    }
    setPublishingId(it.id);
    try {
      await dispatch(publishQuizThunk(it.id)).unwrap();
      toast.success("Quiz published");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Publish failed";
      toast.error(msg);
    } finally {
      setPublishingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId || isDeleting) return;
    setIsDeleting(true);
    const removedId = deleteId;
    try {
      await dispatch(removeQuiz(removedId)).unwrap();
      setQuestionCounts((prev) => {
        const next = { ...prev };
        delete next[removedId];
        return next;
      });
      toast.success("Quiz deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-primary-800">Quizzes</h2>
        <div className="flex items-center gap-3">
          <label className="text-sm text-primary-700">
            <span className="mr-2">Kind:</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as KindFilter)}
              className="rounded-md border border-primary-300 bg-white px-2 py-1 text-sm"
            >
              <option value="all">All</option>
              <option value={QuizKind.Standard}>Standard</option>
              <option value={QuizKind.Daily}>Daily</option>
            </select>
          </label>
          <label className="text-sm text-primary-700">
            <span className="mr-2">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-md border border-primary-300 bg-white px-2 py-1 text-sm"
            >
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <AppButton
            variant={AppButtonVariant.Add}
            onClick={openAdd}
            disabled={loading}
          >
            Add Quiz
          </AppButton>
        </div>
      </div>

      <QuizzesList
        items={filteredItems}
        categoryLookup={categoryLookup}
        questionCounts={questionCounts}
        publishingId={publishingId}
        onEdit={openEdit}
        onDelete={onDelete}
        onPublish={handlePublish}
        onOpenQuestions={(it) => setQuestionsQuiz(it)}
      />

      <QuizFormModal
        open={isModalOpen}
        mode={modalType}
        initial={editingItem}
        categories={catState.items}
        existingDailyDates={existingDailyDates}
        onClose={closeModal}
        onCreateStandard={handleCreateStandard}
        onCreateDaily={handleCreateDaily}
        onEdit={handleEdit}
      />

      <QuestionsModal
        open={!!questionsQuiz}
        quizId={questionsQuiz?.id ?? null}
        quizTitle={questionsQuiz?.title}
        onClose={() => setQuestionsQuiz(null)}
        onCountChange={(id, count) =>
          setQuestionCounts((prev) => ({ ...prev, [id]: count }))
        }
      />

      <ConfirmDeleteModal
        open={isDeleteOpen}
        onCancel={() => {
          if (!isDeleting) {
            setIsDeleteOpen(false);
            setDeleteId(null);
          }
        }}
        onConfirm={confirmDelete}
        confirmLabel={isDeleting ? "Deleting..." : "Delete"}
        disabled={isDeleting}
      />
    </div>
  );
}
