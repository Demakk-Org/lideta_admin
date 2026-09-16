"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import AppModal from "@/components/ui/AppModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import type { StudyMaterial, StudyPlan, Verse } from "@/lib/api/bibleStudies";
import StudyMaterialsEditor from "./StudyMaterialsEditor";
import KeyVersesEditor from "./KeyVersesEditor";

function DiscussionQuestionsEditor({
  items,
  onChange,
}: {
  items: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-primary-800">
          Discussion Questions
        </span>
        <AppButton
          type="button"
          variant={AppButtonVariant.Add}
          className="px-3 py-1 text-xs"
          onClick={() => onChange([...items, ""])}
        >
          Add question
        </AppButton>
      </div>
      {items.length === 0 && (
        <p className="text-xs text-primary-600">No questions added.</p>
      )}
      {items.map((q, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) =>
              onChange(items.map((x, i) => (i === idx ? e.target.value : x)))
            }
            className="flex-1 rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder={`Question ${idx + 1}`}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== idx))}
            className="text-xs font-medium text-red-600 hover:text-red-700"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

export default function StudyPlanFormModal({
  open,
  mode,
  initial,
  studyTitle,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "add" | "edit";
  initial?: StudyPlan;
  studyTitle: string;
  onClose: () => void;
  onSubmit: (plan: StudyPlan) => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [keyVerses, setKeyVerses] = useState<Verse[]>([]);
  const [discussionQuestions, setDiscussionQuestions] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setMaterials(initial?.materials ?? []);
    setKeyVerses(initial?.keyVerses ?? []);
    setDiscussionQuestions(initial?.discussionQuestions ?? []);
  }, [open, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!title.trim()) throw new Error("Plan title is required");
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        materials,
        keyVerses,
        discussionQuestions,
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
      title={mode === "add" ? "Add Study Plan" : "Edit Study Plan"}
      footer={
        <AppButton
          type="submit"
          form="studyPlanForm"
          disabled={!title.trim()}
          variant={mode === "add" ? AppButtonVariant.Add : AppButtonVariant.Edit}
        >
          {mode === "add" ? "Add" : "Save"}
        </AppButton>
      }
    >
      <form id="studyPlanForm" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-primary-800">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Week 1 — Introduction"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-primary-800">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="What this session covers."
            rows={2}
          />
        </div>

        <StudyMaterialsEditor
          items={materials}
          onChange={setMaterials}
          studyTitle={title || studyTitle}
        />

        <KeyVersesEditor items={keyVerses} onChange={setKeyVerses} />

        <DiscussionQuestionsEditor
          items={discussionQuestions}
          onChange={setDiscussionQuestions}
        />
      </form>
    </AppModal>
  );
}
