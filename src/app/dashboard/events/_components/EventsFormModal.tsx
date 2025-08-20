"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import AppModal from "@/components/ui/AppModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import type { WithId, EventDoc, EventDescriptionItem, QuoteValue } from "@/lib/api/events";
import { EventDescriptionType } from "@/lib/api/events";
import { uploadEventImage } from "@/lib/api/storage";
import EthiopianDateTimePicker from "@/components/ui/EthiopianDateTimePicker";
import DescriptionBlocksEditor, { type FormDescItem } from "./DescriptionBlocksEditor";
import FileUploadButton from "@/components/ui/FileUploadButton";

function inputDTValue(v?: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v; // might already be datetime-local
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export default function EventsFormModal({
  open,
  mode,
  initial,
  categories,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "add" | "edit";
  initial?: Partial<WithId<EventDoc>>;
  categories: string[];
  onClose: () => void;
  onSubmit: (payload: EventDoc) => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [programme, setProgramme] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImg, setUploadingImg] = useState(false);
  const [shortDesc, setShortDesc] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [descItems, setDescItems] = useState<FormDescItem[]>([]);
  const [locationPrimary, setLocationPrimary] = useState("");
  const [locationSecondary, setLocationSecondary] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setCategory(initial?.category ?? "");
    setStart(inputDTValue(initial?.start_date_time));
    setEnd(inputDTValue(initial?.end_date_time));
    setImageUrl(initial?.imageUrl ?? "");
    setShortDesc(initial?.short_description ?? "");
    setTagsText(Array.isArray(initial?.tags) ? (initial?.tags as string[]).join(", ") : "");
    setProgramme(initial?.programme ?? "");
    const mapped: FormDescItem[] = (initial?.description ?? []).map((d) => {
      switch (d.type) {
        case EventDescriptionType.List:
          return { type: d.type, value: (d.value || []).join("\n") } as FormDescItem;
        case EventDescriptionType.Quote: {
          const q = d.value as QuoteValue;
          return { type: d.type, value: { text: q.text ?? "", ...(q.ref ? { ref: q.ref } : {}) } } as FormDescItem;
        }
        case EventDescriptionType.Title:
          return { type: d.type, value: String(d.value ?? "") } as FormDescItem;
        case EventDescriptionType.Paragraph:
          return { type: d.type, value: String(d.value ?? "") } as FormDescItem;
        case EventDescriptionType.Banner:
          return { type: d.type, value: String(d.value ?? "") } as FormDescItem;
      }
    });
    setDescItems(mapped);
    setLocationPrimary(initial?.location?.primary ?? "");
    setLocationSecondary(initial?.location?.secondary ?? "");
  }, [open, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!title.trim()) throw new Error("Title is required");
      if (!category.trim()) throw new Error("Event category is required");
      if (!programme.trim()) throw new Error("Programme is required");

      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const description: EventDescriptionItem[] | undefined = descItems.length
        ? descItems.map((d) => {
            if (d.type === EventDescriptionType.List) {
              const arr = String(d.value ?? "")
                .split(/\r?\n|,/)
                .map((v: string) => v.trim())
                .filter(Boolean);
              return { type: EventDescriptionType.List, value: arr } as EventDescriptionItem;
            }
            if (d.type === EventDescriptionType.Quote) {
              const q =
                typeof d.value === "object" && d.value && !Array.isArray(d.value)
                  ? (d.value as QuoteValue)
                  : ({ text: String(d.value ?? "") } as QuoteValue);
              return { type: EventDescriptionType.Quote, value: q } as EventDescriptionItem;
            }
            if (d.type === EventDescriptionType.Banner) {
              return { type: EventDescriptionType.Banner, value: String(d.value ?? "") } as EventDescriptionItem;
            }
            if (d.type === EventDescriptionType.Title) {
              return { type: EventDescriptionType.Title, value: String(d.value ?? "") } as EventDescriptionItem;
            }
            return { type: EventDescriptionType.Paragraph, value: String(d.value ?? "") } as EventDescriptionItem;
          })
        : undefined;

      const payload: EventDoc = {
        title: title.trim(),
        category: category.trim(),
        programme: programme.trim(),
        start_date_time: start.trim() || undefined,
        end_date_time: end.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        location:
          locationPrimary.trim() || locationSecondary.trim()
            ? { primary: locationPrimary.trim(), ...(locationSecondary.trim() ? { secondary: locationSecondary.trim() } : {}) }
            : undefined,
        short_description: shortDesc.trim() || undefined,
        tags: tags.length ? tags : undefined,
        description,
      };

      await onSubmit(payload);
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
      title={mode === "add" ? "Add Event" : "Edit Event"}
      footer={
        <AppButton
          type="submit"
          disabled={!title.trim() || !category.trim() || !programme.trim()}
          variant={mode === "add" ? AppButtonVariant.Add : AppButtonVariant.Edit}
          form="eventForm"
        >
          {mode === "add" ? "Add" : "Save"}
        </AppButton>
      }
    >
      <form id="eventForm" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-primary-800">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Evening Worship Service"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {categories.length === 0 && (
              <p className="mt-1 text-xs text-primary-600">Create an event category first.</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">Programme</label>
            <input
              type="text"
              value={programme}
              onChange={(e) => setProgramme(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Sunday Programme"
              required
            />
          </div>
          <div>
            <EthiopianDateTimePicker label="Start (Ethiopian Calendar)" value={start} onChange={setStart} />
          </div>
          <div>
            <EthiopianDateTimePicker label="End (Ethiopian Calendar)" value={end} onChange={setEnd} />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">Location (Primary)</label>
            <input
              type="text"
              value={locationPrimary}
              onChange={(e) => setLocationPrimary(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Main venue/address"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">Location (Secondary, optional)</label>
            <input
              type="text"
              value={locationSecondary}
              onChange={(e) => setLocationSecondary(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Hall name / Floor / Notes"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">Image (optional)</label>
            <div className="mt-1 flex flex-col gap-3">
              <FileUploadButton
                label={uploadingImg ? "Uploading..." : "Upload Image"}
                accept="image/*"
                disabled={uploadingImg}
                onSelect={async (f) => {
                  try {
                    setUploadingImg(true);
                    const url = await uploadEventImage(f, title || category);
                    setImageUrl(url);
                    toast.success("Image uploaded");
                  } catch {
                    toast.error("Image upload failed");
                  } finally {
                    setUploadingImg(false);
                  }
                }}
              />
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="flex-1 rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="https://..."
              />
              {imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="preview" className="h-10 w-10 rounded object-cover border" />
              )}
            </div>
            {uploadingImg && <p className="mt-1 text-xs text-primary-600">Uploading...</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">Short Description</label>
            <textarea
              value={shortDesc}
              onChange={(e) => setShortDesc(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="An evening sermon focused on gratitude and reflection."
              rows={3}
            />
          </div>
          <DescriptionBlocksEditor items={descItems} onChange={setDescItems} titleOrCategory={title || category} />
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">Tags (comma separated)</label>
            <input
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Worship, Thanksgiving, Evening Service"
            />
          </div>
        </div>
      </form>
    </AppModal>
  );
}
