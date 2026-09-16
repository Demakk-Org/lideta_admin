"use client";

import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import AppModal from "@/components/ui/AppModal";
import { useMemo } from "react";
import type { BibleForm } from "./types";
import FileUploadButton from "@/components/ui/FileUploadButton";

type Props = {
  isOpen: boolean;
  form: BibleForm;
  setForm: React.Dispatch<React.SetStateAction<BibleForm>>;
  submitting: boolean;
  submitLabel: string;
  submitVariant: AppButtonVariant;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
};

export default function BiblesModal({ isOpen, form, setForm, submitting, submitLabel, submitVariant, onSubmit, onClose }: Props) {
  const langs = useMemo(() => [
    { code: "am", label: "Amharic" },
    { code: "en", label: "English" },
  ], []);

  if (!isOpen) return null;
  return (
    <AppModal
      open={isOpen}
      type={submitVariant === AppButtonVariant.Edit ? "edit" : "add"}
      title="Bible Source"
      onClose={onClose}
      footer={
        <AppButton type="submit" disabled={submitting} variant={submitVariant} form="bibleForm">
          {submitting ? "Saving..." : submitLabel || "Save"}
        </AppButton>
      }
    >
      <form
        id="bibleForm"
        onSubmit={(e) => onSubmit(e)}
        className="space-y-4 max-h-[70vh] overflow-y-auto pr-1"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-primary-800">Language</label>
            <select
              value={form.lang}
              onChange={(e) => setForm((s) => ({ ...s, lang: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-primary-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="">Select language</option>
              {langs.map((l) => (
                <option key={l.code} value={l.code}>{l.label} ({l.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">Short Name</label>
            <input
              type="text"
              value={form.short_name}
              onChange={(e) => setForm((s) => ({ ...s, short_name: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="AM-Bible"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Amharic Holy Bible"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">Source URL (optional)</label>
            <input
              type="url"
              value={form.source_url}
              onChange={(e) => setForm((s) => ({ ...s, source_url: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="https://..."
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">Upload JSON (optional)</label>
            <div className="mt-1">
              <FileUploadButton
                label={form.file ? "Replace File" : "Choose JSON File"}
                accept="application/json,.json"
                onSelect={(file) => setForm((s) => ({ ...s, file }))}
                className="inline-block"
              />
            </div>
            <p className="mt-1 text-xs text-primary-600">If a file is selected, it will be uploaded and its URL used as the source.</p>
          </div>
        </div>
      </form>
    </AppModal>
  );
}
