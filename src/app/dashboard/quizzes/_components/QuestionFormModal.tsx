"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import AppModal from "@/components/ui/AppModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import {
  QUESTION_TYPE_LABELS,
  QuestionType,
} from "@/lib/api/questions";
import type {
  QuestionDoc,
  QuestionWriteInput,
  VerseReference,
} from "@/lib/api/questions";

type Mode = "add" | "edit";

function parseIntOrNull(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseVersesList(v: string): number[] {
  return v
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.trunc(n));
}

export default function QuestionFormModal({
  open,
  mode,
  initial,
  defaultOrder,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: Mode;
  initial?: QuestionDoc;
  defaultOrder: number;
  onClose: () => void;
  onSubmit: (payload: QuestionWriteInput) => Promise<void> | void;
}) {
  const [text, setText] = useState("");
  const [questionType, setQuestionType] = useState<QuestionType>(
    QuestionType.MultipleChoice,
  );
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [correctOptionId, setCorrectOptionId] = useState<number | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [explanation, setExplanation] = useState("");

  // Verse reference fields
  const [refEnabled, setRefEnabled] = useState(false);
  const [refBook, setRefBook] = useState("");
  const [refChapter, setRefChapter] = useState("");
  const [refVerse, setRefVerse] = useState("");
  const [refToVerse, setRefToVerse] = useState("");
  const [refVerses, setRefVerses] = useState("");

  useEffect(() => {
    if (!open) return;
    const init = initial;
    setText(init?.text ?? "");
    const t = init?.questionType ?? QuestionType.MultipleChoice;
    setQuestionType(t);
    if (t === QuestionType.MultipleChoice) {
      setOptions(
        init?.options && init.options.length >= 2 ? init.options : ["", ""],
      );
    } else {
      setOptions(["", ""]);
    }
    setCorrectOptionId(init?.correctOptionId ?? null);
    setAnswerText(init?.answerText ?? "");
    setExplanation(init?.explanation ?? "");

    const v = init?.referenceVerse ?? null;
    setRefEnabled(!!v);
    setRefBook(v ? String(v.book) : "");
    setRefChapter(v ? String(v.chapter) : "");
    setRefVerse(v?.verse != null ? String(v.verse) : "");
    setRefToVerse(v?.toVerse != null ? String(v.toVerse) : "");
    setRefVerses(v?.verses && v.verses.length ? v.verses.join(", ") : "");
  }, [open, initial]);

  // When switching question type, reset type-specific fields cleanly.
  useEffect(() => {
    if (questionType === QuestionType.TrueFalse) {
      setOptions(["", ""]);
      setAnswerText("");
      if (correctOptionId !== 0 && correctOptionId !== 1) {
        setCorrectOptionId(null);
      }
    } else if (questionType === QuestionType.ShortAnswer) {
      setOptions(["", ""]);
      setCorrectOptionId(null);
    } else {
      setAnswerText("");
      if (options.length < 2) setOptions(["", ""]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionType]);

  const canSubmit = useMemo(() => {
    if (!text.trim()) return false;
    if (questionType === QuestionType.TrueFalse) {
      return correctOptionId === 0 || correctOptionId === 1;
    }
    if (questionType === QuestionType.MultipleChoice) {
      const cleaned = options.map((o) => o.trim()).filter(Boolean);
      if (cleaned.length < 2) return false;
      if (
        correctOptionId == null ||
        correctOptionId < 0 ||
        correctOptionId >= cleaned.length
      ) {
        return false;
      }
      return true;
    }
    if (questionType === QuestionType.ShortAnswer) {
      return answerText.trim().length > 0;
    }
    return false;
  }, [text, questionType, correctOptionId, options, answerText]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let referenceVerse: VerseReference | null = null;
      if (refEnabled) {
        const book = parseIntOrNull(refBook);
        const chapter = parseIntOrNull(refChapter);
        if (book == null || chapter == null) {
          throw new Error(
            "Reference verse needs at least a book and chapter number",
          );
        }
        const versesArr = parseVersesList(refVerses);
        referenceVerse = {
          book,
          chapter,
          verse: parseIntOrNull(refVerse),
          toVerse: parseIntOrNull(refToVerse),
          verses: versesArr.length ? versesArr : null,
        };
      }

      const payload: QuestionWriteInput = {
        text: text.trim(),
        questionType,
        options:
          questionType === QuestionType.MultipleChoice
            ? options.map((o) => o.trim()).filter(Boolean)
            : [],
        correctOptionId:
          questionType === QuestionType.ShortAnswer ? null : correctOptionId,
        answerText:
          questionType === QuestionType.ShortAnswer
            ? answerText.trim()
            : null,
        explanation: explanation.trim() ? explanation.trim() : null,
        referenceVerse,
        order: initial?.order ?? defaultOrder,
      };

      await onSubmit(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submit failed";
      toast.error(msg);
    }
  };

  const addOption = () => setOptions((o) => [...o, ""]);
  const removeOption = (idx: number) => {
    setOptions((o) => o.filter((_, i) => i !== idx));
    if (correctOptionId != null) {
      if (correctOptionId === idx) setCorrectOptionId(null);
      else if (correctOptionId > idx) setCorrectOptionId(correctOptionId - 1);
    }
  };
  const updateOption = (idx: number, value: string) =>
    setOptions((o) => o.map((v, i) => (i === idx ? value : v)));

  return (
    <AppModal
      open={open}
      type={mode}
      onClose={onClose}
      title={mode === "add" ? "Add Question" : "Edit Question"}
      footer={
        <AppButton
          type="submit"
          form="questionForm"
          disabled={!canSubmit}
          variant={mode === "add" ? AppButtonVariant.Add : AppButtonVariant.Edit}
        >
          {mode === "add" ? "Add" : "Save"}
        </AppButton>
      }
    >
      <form id="questionForm" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-primary-800">
            Type
          </label>
          <select
            value={questionType}
            onChange={(e) => setQuestionType(e.target.value as QuestionType)}
            className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((k) => (
              <option key={k} value={k}>
                {QUESTION_TYPE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-primary-800">
            Question
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            rows={3}
            required
          />
        </div>

        {questionType === QuestionType.TrueFalse && (
          <div>
            <label className="block text-sm font-medium text-primary-800">
              Correct Answer
            </label>
            <div className="mt-1 flex gap-3">
              {[
                { id: 1, label: "True" },
                { id: 0, label: "False" },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    correctOptionId === opt.id
                      ? "border-primary-500 bg-primary-50 text-primary-900"
                      : "border-primary-300 text-primary-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="trueFalse"
                    checked={correctOptionId === opt.id}
                    onChange={() => setCorrectOptionId(opt.id)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        )}

        {questionType === QuestionType.MultipleChoice && (
          <div>
            <label className="block text-sm font-medium text-primary-800">
              Options
            </label>
            <div className="mt-1 space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correctOption"
                    checked={correctOptionId === idx}
                    onChange={() => setCorrectOptionId(idx)}
                    title="Mark as correct"
                  />
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(idx, e.target.value)}
                    className="flex-1 rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder={`Option ${idx + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    disabled={options.length <= 2}
                    className="rounded-md border border-primary-300 px-2 py-1 text-xs text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addOption}
              className="mt-2 rounded-md border border-primary-300 px-3 py-1 text-xs text-primary-700 hover:bg-primary-50"
            >
              + Add Option
            </button>
            <p className="mt-1 text-xs text-primary-600">
              Tick the radio next to the correct option.
            </p>
          </div>
        )}

        {questionType === QuestionType.ShortAnswer && (
          <div>
            <label className="block text-sm font-medium text-primary-800">
              Expected Answer
            </label>
            <input
              type="text"
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-primary-800">
            Explanation (optional)
          </label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            rows={2}
          />
        </div>

        <div className="rounded-md border border-primary-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-primary-800">
            <input
              type="checkbox"
              checked={refEnabled}
              onChange={(e) => setRefEnabled(e.target.checked)}
            />
            Reference Verse (optional)
          </label>
          {refEnabled && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-primary-700">Book #</label>
                <input
                  type="number"
                  min={1}
                  value={refBook}
                  onChange={(e) => setRefBook(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-primary-700">
                  Chapter
                </label>
                <input
                  type="number"
                  min={1}
                  value={refChapter}
                  onChange={(e) => setRefChapter(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-primary-700">
                  Verse (single or range start)
                </label>
                <input
                  type="number"
                  min={1}
                  value={refVerse}
                  onChange={(e) => setRefVerse(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs text-primary-700">
                  To Verse (range end)
                </label>
                <input
                  type="number"
                  min={1}
                  value={refToVerse}
                  onChange={(e) => setRefToVerse(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-primary-700">
                  Verses (comma-separated, overrides single/range)
                </label>
                <input
                  type="text"
                  value={refVerses}
                  onChange={(e) => setRefVerses(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="3, 5, 8"
                />
              </div>
            </div>
          )}
        </div>
      </form>
    </AppModal>
  );
}
