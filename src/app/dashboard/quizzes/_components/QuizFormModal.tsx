"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import AppModal from "@/components/ui/AppModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import {
  AGE_GROUP_LABELS,
  AgeGroup,
  DIFFICULTY_LEVEL_LABELS,
  DifficultyLevel,
  QUIZ_KIND_LABELS,
  QuizKind,
  formatDailyDateKey,
} from "@/lib/api/quizzes";
import type {
  CreateDailyQuizInput,
  CreateStandardQuizInput,
  QuizDoc,
  UpdateQuizInput,
  WithId,
} from "@/lib/api/quizzes";
import type { QuizCategory, WithId as WithCatId } from "@/lib/api/quizCategories";

function todayDateInputValue(): string {
  return formatDailyDateKey(new Date());
}

function parseDateInput(v: string): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function formatCreatedAt(v: string) {
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString();
}

export default function QuizFormModal({
  open,
  mode,
  initial,
  categories,
  existingDailyDates,
  onClose,
  onCreateStandard,
  onCreateDaily,
  onEdit,
}: {
  open: boolean;
  mode: "add" | "edit";
  initial?: Partial<WithId<QuizDoc>>;
  categories: WithCatId<QuizCategory>[];
  existingDailyDates: Set<string>;
  onClose: () => void;
  onCreateStandard: (payload: CreateStandardQuizInput) => Promise<void> | void;
  onCreateDaily: (payload: CreateDailyQuizInput) => Promise<void> | void;
  onEdit: (id: string, payload: UpdateQuizInput) => Promise<void> | void;
}) {
  const [kind, setKind] = useState<QuizKind>(QuizKind.Standard);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(AgeGroup.All);
  const [dificultyLevel, setDificultyLevel] = useState<DifficultyLevel>(
    DifficultyLevel.Any,
  );
  const [dailyDate, setDailyDate] = useState<string>(todayDateInputValue());

  useEffect(() => {
    if (!open) return;
    setKind(initial?.kind ?? QuizKind.Standard);
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setCategoryId(initial?.categoryId ?? "");
    setAgeGroup(initial?.ageGroup ?? AgeGroup.All);
    setDificultyLevel(initial?.dificultyLevel ?? DifficultyLevel.Any);
    setDailyDate(todayDateInputValue());
  }, [open, initial]);

  useEffect(() => {
    if (kind === QuizKind.Daily) setCategoryId("");
  }, [kind]);

  const isEdit = mode === "edit";
  const isDaily = kind === QuizKind.Daily;

  const dailyDateTaken =
    !isEdit && isDaily && !!dailyDate && existingDailyDates.has(dailyDate);

  const canSubmit = useMemo(() => {
    if (!title.trim() || !description.trim()) return false;
    if (!isDaily && !categoryId.trim()) return false;
    if (!isEdit && isDaily) {
      if (!parseDateInput(dailyDate)) return false;
      if (dailyDateTaken) return false;
    }
    return true;
  }, [title, description, categoryId, isEdit, isDaily, dailyDate, dailyDateTaken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!title.trim()) throw new Error("Title is required");
      if (!description.trim()) throw new Error("Description is required");
      if (!categoryId.trim()) throw new Error("Category is required");

      if (!isDaily && !categoryId.trim()) {
        throw new Error("Category is required");
      }

      if (isEdit) {
        if (!initial?.id) throw new Error("Missing quiz id");
        await onEdit(initial.id, {
          title: title.trim(),
          description: description.trim(),
          categoryId: isDaily ? null : categoryId.trim(),
          ageGroup,
          dificultyLevel,
          kind,
        });
        return;
      }

      if (isDaily) {
        const date = parseDateInput(dailyDate);
        if (!date) throw new Error("Pick a valid date for the daily quiz");
        if (existingDailyDates.has(dailyDate)) {
          throw new Error(`A daily quiz already exists for ${dailyDate}`);
        }
        await onCreateDaily({
          title: title.trim(),
          description: description.trim(),
          ageGroup,
          dificultyLevel,
          date,
        });
        return;
      }

      await onCreateStandard({
        title: title.trim(),
        description: description.trim(),
        categoryId: categoryId.trim(),
        ageGroup,
        dificultyLevel,
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
      title={isEdit ? "Edit Quiz" : "Add Quiz"}
      footer={
        <AppButton
          type="submit"
          disabled={!canSubmit}
          variant={isEdit ? AppButtonVariant.Edit : AppButtonVariant.Add}
          form="quizForm"
        >
          {isEdit ? "Save" : "Add"}
        </AppButton>
      }
    >
      <form id="quizForm" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-primary-800">
              Kind
            </label>
            {isEdit ? (
              <input
                type="text"
                value={QUIZ_KIND_LABELS[kind]}
                disabled
                className="mt-1 block w-full rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-primary-700"
              />
            ) : (
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as QuizKind)}
                className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value={QuizKind.Standard}>
                  {QUIZ_KIND_LABELS[QuizKind.Standard]}
                </option>
                <option value={QuizKind.Daily}>
                  {QUIZ_KIND_LABELS[QuizKind.Daily]}
                </option>
              </select>
            )}
          </div>

          {!isEdit && isDaily && (
            <div>
              <label className="block text-sm font-medium text-primary-800">
                Daily Date
              </label>
              <input
                type="date"
                value={dailyDate}
                onChange={(e) => setDailyDate(e.target.value)}
                className={`mt-1 block w-full rounded-md border bg-white px-3 py-2 focus:outline-none focus:ring-2 ${
                  dailyDateTaken
                    ? "border-red-400 focus:ring-red-500"
                    : "border-primary-300 focus:ring-primary-500"
                }`}
                required
              />
              {dailyDateTaken ? (
                <p className="mt-1 text-xs text-red-600">
                  A daily quiz already exists for {dailyDate}. Pick another date.
                </p>
              ) : (
                <p className="mt-1 text-xs text-primary-600">
                  Document id will be{" "}
                  <code className="font-mono">
                    daily-{dailyDate || "YYYY-MM-DD"}
                  </code>
                </p>
              )}
            </div>
          )}

          {isEdit && initial?.createdAt && (
            <div>
              <label className="block text-sm font-medium text-primary-800">
                Created
              </label>
              <input
                type="text"
                value={formatCreatedAt(initial.createdAt)}
                disabled
                className="mt-1 block w-full rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-primary-700"
              />
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Old Testament Basics"
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
              placeholder="Short summary of what this quiz covers"
              rows={3}
              required
            />
          </div>

          {!isDaily && (
            <div>
              <label className="block text-sm font-medium text-primary-800">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              >
                <option value="">Select category</option>
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
                  No quiz categories found in <code>quiz_categories</code>.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-primary-800">
              Age Group
            </label>
            <select
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {(Object.keys(AGE_GROUP_LABELS) as AgeGroup[]).map((k) => (
                <option key={k} value={k}>
                  {AGE_GROUP_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-primary-800">
              Difficulty
            </label>
            <select
              value={dificultyLevel}
              onChange={(e) =>
                setDificultyLevel(e.target.value as DifficultyLevel)
              }
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {(Object.keys(DIFFICULTY_LEVEL_LABELS) as DifficultyLevel[]).map(
                (k) => (
                  <option key={k} value={k}>
                    {DIFFICULTY_LEVEL_LABELS[k]}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>
      </form>
    </AppModal>
  );
}
