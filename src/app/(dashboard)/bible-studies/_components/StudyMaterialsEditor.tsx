"use client";

import toast from "react-hot-toast";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import FileUploadButton from "@/components/ui/FileUploadButton";
import {
  STUDY_MATERIAL_TYPE_LABELS,
  StudyMaterialType,
} from "@/lib/api/bibleStudies";
import type { StudyMaterial } from "@/lib/api/bibleStudies";
import {
  uploadBibleStudyImage,
  uploadBibleStudyMaterial,
} from "@/lib/api/storage";
import { useState } from "react";

const ACCEPT_BY_TYPE: Record<StudyMaterialType, string> = {
  [StudyMaterialType.Audio]: "audio/*",
  [StudyMaterialType.Pdf]: "application/pdf",
  [StudyMaterialType.Video]: "video/*",
  [StudyMaterialType.Link]: "*/*",
  [StudyMaterialType.Image]: "image/*",
};

export function emptyMaterial(): StudyMaterial {
  return {
    thumbnailUrl: "",
    title: "",
    downloadUrl: "",
    type: StudyMaterialType.Link,
  };
}

export default function StudyMaterialsEditor({
  items,
  onChange,
  studyTitle,
}: {
  items: StudyMaterial[];
  onChange: (next: StudyMaterial[]) => void;
  studyTitle: string;
}) {
  const [busyIdx, setBusyIdx] = useState<number | null>(null);

  const update = (idx: number, patch: Partial<StudyMaterial>) => {
    onChange(items.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-primary-800">
          Materials
        </label>
        <AppButton
          type="button"
          variant={AppButtonVariant.Add}
          className="px-3 py-1 text-xs"
          onClick={() => onChange([...items, emptyMaterial()])}
        >
          Add material
        </AppButton>
      </div>

      {items.length === 0 && (
        <p className="text-xs text-primary-600">No materials added.</p>
      )}

      {items.map((m, idx) => (
        <div
          key={idx}
          className="space-y-2 rounded-md border border-primary-200 bg-primary-50/40 p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-primary-700">
              Material {idx + 1}
            </span>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-xs font-medium text-red-600 hover:text-red-700"
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={m.title}
              onChange={(e) => update(idx, { title: e.target.value })}
              className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Material title"
            />
            <select
              value={m.type}
              onChange={(e) =>
                update(idx, { type: e.target.value as StudyMaterialType })
              }
              className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {Object.values(StudyMaterialType).map((t) => (
                <option key={t} value={t}>
                  {STUDY_MATERIAL_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-primary-700">
              Download URL
            </span>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={m.downloadUrl}
                onChange={(e) => update(idx, { downloadUrl: e.target.value })}
                className="flex-1 rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="https://..."
              />
              {m.type !== StudyMaterialType.Link && (
                <FileUploadButton
                  label={busyIdx === idx ? "Uploading..." : "Upload"}
                  accept={ACCEPT_BY_TYPE[m.type]}
                  disabled={busyIdx !== null}
                  onSelect={async (f) => {
                    try {
                      setBusyIdx(idx);
                      const url = await uploadBibleStudyMaterial(
                        f,
                        m.type,
                        m.title || studyTitle,
                      );
                      update(idx, { downloadUrl: url });
                      toast.success("Material uploaded");
                    } catch {
                      toast.error("Upload failed");
                    } finally {
                      setBusyIdx(null);
                    }
                  }}
                />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-primary-700">
              Thumbnail URL
            </span>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={m.thumbnailUrl}
                onChange={(e) => update(idx, { thumbnailUrl: e.target.value })}
                className="flex-1 rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="https://..."
              />
              <FileUploadButton
                label={busyIdx === idx ? "Uploading..." : "Upload"}
                accept="image/*"
                disabled={busyIdx !== null}
                onSelect={async (f) => {
                  try {
                    setBusyIdx(idx);
                    const url = await uploadBibleStudyImage(
                      f,
                      m.title || studyTitle,
                    );
                    update(idx, { thumbnailUrl: url });
                    toast.success("Thumbnail uploaded");
                  } catch {
                    toast.error("Upload failed");
                  } finally {
                    setBusyIdx(null);
                  }
                }}
              />
              {m.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.thumbnailUrl}
                  alt="thumb"
                  className="h-9 w-9 rounded object-cover border"
                />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
