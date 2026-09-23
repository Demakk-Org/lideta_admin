"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import AppModal from "@/components/ui/AppModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import type { WithId, EventDoc, EventDescriptionItem, QuoteValue } from "@/lib/api/events";
import { EventDescriptionType } from "@/lib/api/events";
import { uploadEventImage } from "@/lib/api/storage";
import EthiopianDateRangePicker from "@/components/ui/EthiopianDateRangePicker";
import DescriptionBlocksEditor, { type FormDescItem } from "./DescriptionBlocksEditor";
import RecurrenceEditor, {
  anchorInputsEqual,
  deriveAnchor,
  emptyRecurrenceForm,
  fromRecurrence,
  toRecurrence,
  type RecurrenceForm,
} from "./RecurrenceEditor";
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

/**
 * How long an event runs when no End was given. The published app non-null-casts
 * `end_date_time` and throws on null, taking the whole events list down with it,
 * so a blank End cannot simply be stored as missing — it is derived instead.
 * Two hours matches the shortest of the church's standing programmes.
 */
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

/** `end` if given, else `start` plus the default duration. */
function endOrDerived(start: string, end: string): string {
  if (end.trim()) return end.trim();
  const startedAt = new Date(start);
  if (isNaN(startedAt.getTime())) return "";
  return inputDTValue(new Date(startedAt.getTime() + DEFAULT_DURATION_MS).toISOString());
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
  const [repeat, setRepeat] = useState<RecurrenceForm>(emptyRecurrenceForm);

  function resetFields(from?: Partial<WithId<EventDoc>>) {
    setTitle(from?.title ?? "");
    setCategory(from?.category ?? "");
    setStart(inputDTValue(from?.start_date_time));
    setEnd(inputDTValue(from?.end_date_time));
    setImageUrl(from?.imageUrl ?? "");
    setShortDesc(from?.short_description ?? "");
    setTagsText(Array.isArray(from?.tags) ? (from?.tags as string[]).join(", ") : "");
    setProgramme(from?.programme ?? "");
    const mapped: FormDescItem[] = (from?.description ?? []).map((d) => {
      switch (d.type) {
        case EventDescriptionType.List:
          return { type: d.type, value: (d.value || []).join("\n") } as FormDescItem;
        case EventDescriptionType.Quote: {
          const q = d.value as QuoteValue;
          return {
            type: d.type,
            value: { ...q, text: q.text ?? "" },
          } as FormDescItem;
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
    setLocationPrimary(from?.location?.primary ?? "");
    setLocationSecondary(from?.location?.secondary ?? "");
    setRepeat(fromRecurrence(from?.recurrence));
  }

  // Reset when the modal opens — during render, NOT in an effect.
  //
  // AppModal unmounts its children while closed, so on reopen React renders the
  // form (and mounts EthiopianDateTimePicker) with whatever the previous session
  // left behind. An effect runs too late: the picker has already seeded its own
  // day/month/year/time from that stale `start`, and its initialiser then refuses
  // to clear them ("only clear if value becomes empty and local state is also
  // empty"), so the old date stayed on screen even though `start` here was back
  // to "". That mismatch is why a second cancel-and-reopen looked clean — by then
  // `start` really was "".
  //
  // This is React's documented "adjusting state when a prop changes" pattern. It
  // also means a background refresh of `initial` mid-edit no longer clobbers what
  // is being typed, which the old [open, initial] dependency did.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) resetFields(initial);
  }

  /**
   * The anchor to store for a repeating event: occurrence 1.
   *
   * An existing anchor is kept whenever the schedule inputs are unchanged. The
   * app derives every occurrence from this date and treats it as fixed for the
   * life of the series, so re-deriving it on an unrelated edit — a new title,
   * say — would renumber the whole series and lose the dates already behind it.
   * It is only recomputed when the day, time or duration actually changes.
   */
  const resolveAnchor = (): { start: Date; end: Date } | null => {
    if (repeat.mode === "off") return null;

    if (initial?.recurrence && initial.start_date_time && initial.end_date_time) {
      const storedStart = new Date(initial.start_date_time);
      const storedEnd = new Date(initial.end_date_time);
      const stored = fromRecurrence(initial.recurrence, storedStart, storedEnd);
      if (
        !isNaN(storedStart.getTime()) &&
        !isNaN(storedEnd.getTime()) &&
        anchorInputsEqual(repeat, stored)
      ) {
        return { start: storedStart, end: storedEnd };
      }
    }
    return deriveAnchor(repeat);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!title.trim()) throw new Error("Title is required");
      if (!category.trim()) throw new Error("Event category is required");
      if (!programme.trim()) throw new Error("Programme is required");
      if (repeat.mode === "off" && !start.trim()) {
        // Both of the app's queries filter on the dates and it casts
        // start_date_time non-null, so an event without a start cannot be found
        // and breaks the list for everyone. A repeating event derives its dates
        // from the rule instead, so there is nothing to type.
        throw new Error("Start date and time is required");
      }
      if (repeat.mode !== "off") {
        const days = repeat.mode === "weekly" ? repeat.weekdays : repeat.monthDays;
        if (days.length === 0) {
          throw new Error(
            repeat.mode === "weekly"
              ? "Choose at least one day of the week"
              : "Choose at least one day of the month",
          );
        }
        if (repeat.endMode === "until" && !repeat.until.trim()) {
          throw new Error("Choose the date the repeat ends");
        }
        if (repeat.endMode === "count" && repeat.count < 1) {
          throw new Error("Number of occurrences must be at least 1");
        }
        if (!resolveAnchor()) {
          throw new Error(
            "This rule produces no upcoming date — check the times and the end condition",
          );
        }
      }

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
        // A repeating event stores its FIRST occurrence as the anchor; the app
        // derives every later date from it and keeps `end - start` as the
        // duration. Nothing rewrites these afterwards.
        ...(repeat.mode === "off"
          ? { start_date_time: start.trim(), end_date_time: endOrDerived(start, end) }
          : (() => {
              const anchor = resolveAnchor()!;
              return {
                start_date_time: anchor.start.toISOString(),
                end_date_time: anchor.end.toISOString(),
              };
            })()),
        // The published app non-null-casts each of these, so a blank field is
        // stored as an empty value, never as `undefined` (which Firestore
        // rejects) or as a missing key (which breaks the app's events list).
        imageUrl: imageUrl.trim(),
        location: {
          primary: locationPrimary.trim(),
          ...(locationSecondary.trim() ? { secondary: locationSecondary.trim() } : {}),
        },
        short_description: shortDesc.trim(),
        tags,
        description: description ?? [],
        // `null` clears a rule that used to exist; when there never was one the
        // keys are left out entirely, since Firestore rejects `undefined`.
        ...(repeat.mode === "off"
          ? initial?.recurrence
            ? { recurrence: null }
            : {}
          : {
              recurrence: toRecurrence(repeat)!,
              recurrence_active: initial?.recurrence_active ?? true,
              recurrence_occurrence: initial?.recurrence_occurrence ?? 1,
            }),
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
      // Wider than the default max-w-lg: this form is two columns and the
      // monthly recurrence picker lays out 31 day chips, which wrap badly at
      // 512px. Set per-modal so no other dialog is affected.
      widthClass="max-w-3xl"
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
          {/* A repeating event has no dates of its own to type: the anchor is
              derived from the rule below. Showing both would let the two
              disagree, with only one of them actually stored. */}
          {repeat.mode === "off" && (
            <div>
              <EthiopianDateRangePicker
                label="Date (Ethiopian Calendar)"
                start={start}
                end={end}
                onChange={({ start: s, end: e }) => {
                  setStart(s);
                  setEnd(e);
                }}
                defaultDurationMs={DEFAULT_DURATION_MS}
                required
              />
            </div>
          )}
          <RecurrenceEditor
            value={repeat}
            onChange={setRepeat}
            startWeekdayHint={start ? new Date(start).getDay() : undefined}
          />
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
