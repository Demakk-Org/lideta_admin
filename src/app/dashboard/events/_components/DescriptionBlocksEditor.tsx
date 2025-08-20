"use client";

import { useState } from "react";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import { EventDescriptionType, type QuoteValue } from "@/lib/api/events";
import { uploadEventImage } from "@/lib/api/storage";
import FileUploadButton from "@/components/ui/FileUploadButton";

export type FormDescItem = { type: EventDescriptionType; value: string | QuoteValue };

export default function DescriptionBlocksEditor({
  items,
  onChange,
  titleOrCategory,
}: {
  items: FormDescItem[];
  onChange: (next: FormDescItem[]) => void;
  titleOrCategory?: string;
}) {
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  return (
    <div className="sm:col-span-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-primary-800">Description Blocks</label>
        <AppButton
          type="button"
          variant={AppButtonVariant.Add}
          className="px-3 py-1 text-xs"
          onClick={() => onChange([...items, { type: EventDescriptionType.Paragraph, value: "" }])}
        >
          Add Block
        </AppButton>
      </div>
      <div className="mt-2 space-y-3">
        {items.map((blk, idx) => (
          <div key={idx} className="rounded-md border border-primary-200 p-3">
            <div className="flex items-center gap-2">
              <select
                value={blk.type}
                onChange={(e) => {
                  const t = e.target.value as EventDescriptionType;
                  onChange(
                    items.map((b, i) => {
                      if (i !== idx) return b;
                      let newVal: string | QuoteValue =
                        typeof b.value === "object" && b.value && !Array.isArray(b.value)
                          ? ({ text: (b.value as QuoteValue).text ?? "", ref: (b.value as QuoteValue).ref } as QuoteValue)
                          : String(b.value ?? "");
                      if (t === EventDescriptionType.List) {
                        if (typeof b.value === "object" && b.value && !Array.isArray(b.value)) {
                          newVal = (b.value as QuoteValue).text ?? "";
                        } else {
                          newVal = String(b.value ?? "");
                        }
                      } else if (t === EventDescriptionType.Quote) {
                        if (typeof b.value === "object" && b.value && !Array.isArray(b.value)) {
                          const q = b.value as QuoteValue;
                          newVal = { text: q.text ?? "", ref: q.ref } as QuoteValue;
                        } else {
                          newVal = { text: String(b.value ?? "") } as QuoteValue;
                        }
                      } else {
                        if (typeof b.value === "object" && b.value && !Array.isArray(b.value)) {
                          newVal = (b.value as QuoteValue).text ?? "";
                        } else {
                          newVal = String(b.value ?? "");
                        }
                      }
                      return { ...b, type: t, value: newVal };
                    })
                  );
                }}
                className="rounded-md border border-primary-300 bg-white px-2 py-1 text-sm"
              >
                <option value={EventDescriptionType.Title}>title</option>
                <option value={EventDescriptionType.Paragraph}>paragraph</option>
                <option value={EventDescriptionType.Banner}>banner</option>
                <option value={EventDescriptionType.Quote}>quote</option>
                <option value={EventDescriptionType.List}>list</option>
              </select>
              <AppButton
                type="button"
                variant={AppButtonVariant.Delete}
                className="px-3 py-1 text-xs ml-auto"
                onClick={() => onChange(items.filter((_, i) => i !== idx))}
              >
                Remove
              </AppButton>
            </div>
            {blk.type === EventDescriptionType.List ? (
              <textarea
                value={typeof blk.value === "string" ? blk.value : ""}
                onChange={(e) => onChange(items.map((b, i) => (i === idx ? { ...b, value: e.target.value } : b)))}
                className="mt-2 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder={"One item per line"}
                rows={3}
              />
            ) : blk.type === EventDescriptionType.Quote ? (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={typeof blk.value === "object" && blk.value && !Array.isArray(blk.value) ? (blk.value as QuoteValue).text : String(blk.value ?? "")}
                  onChange={(e) =>
                    onChange(
                      items.map((b, i) =>
                        i === idx
                          ? {
                              ...b,
                              value: {
                                text: e.target.value,
                                ref:
                                  typeof b.value === "object" && b.value && !Array.isArray(b.value)
                                    ? (b.value as QuoteValue).ref
                                    : undefined,
                              } as QuoteValue,
                            }
                          : b
                      )
                    )
                  }
                  className="block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Quote text"
                />
                <input
                  type="text"
                  value={typeof blk.value === "object" && blk.value && !Array.isArray(blk.value) ? (blk.value as QuoteValue).ref ?? "" : ""}
                  onChange={(e) =>
                    onChange(
                      items.map((b, i) =>
                        i === idx
                          ? {
                              ...b,
                              value: {
                                text:
                                  typeof b.value === "object" && b.value && !Array.isArray(b.value)
                                    ? (b.value as QuoteValue).text
                                    : String(b.value ?? ""),
                                ref: e.target.value,
                              } as QuoteValue,
                            }
                          : b
                      )
                    )
                  }
                  className="block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Reference (optional)"
                />
              </div>
            ) : blk.type === EventDescriptionType.Banner ? (
              <div className="mt-2 space-y-2">
                <div className="flex flex-col gap-2">
                  <FileUploadButton
                    label={uploadingIndex === idx ? "Uploading banner..." : "Upload Banner Image"}
                    accept="image/*"
                    disabled={uploadingIndex === idx}
                    onSelect={async (f) => {
                      try {
                        setUploadingIndex(idx);
                        const url = await uploadEventImage(f, titleOrCategory || "banner");
                        onChange(items.map((b, i) => (i === idx ? { ...b, value: url } : b)));
                      } catch {
                        // no toast here; parent handles notifications elsewhere if needed
                      } finally {
                        setUploadingIndex((cur) => (cur === idx ? null : cur));
                      }
                    }}
                  />
                  <input
                    type="url"
                    value={typeof blk.value === "string" ? blk.value : ""}
                    onChange={(e) => onChange(items.map((b, i) => (i === idx ? { ...b, value: e.target.value } : b)))}
                    className="flex-1 rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="https://banner.example/..."
                  />
                  {typeof blk.value === "string" && blk.value ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={blk.value} alt="banner preview" className="h-20 w-full rounded object-cover border" />
                  ) : null}
                  {uploadingIndex === idx && (
                    <p className="text-xs text-primary-600">Uploading banner...</p>
                  )}
                </div>
              </div>
            ) : (
              <input
                type="text"
                value={typeof blk.value === "string" ? blk.value : ""}
                onChange={(e) => onChange(items.map((b, i) => (i === idx ? { ...b, value: e.target.value } : b)))}
                className="mt-2 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder={
                  blk.type === EventDescriptionType.Title ? "Section title" : "Paragraph text"
                }
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
