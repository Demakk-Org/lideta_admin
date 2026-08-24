"use client";

import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import NotifyButton from "@/components/ui/NotifyButton";
import type { WithId, EventDoc, EventDescriptionItem } from "@/lib/api/events";
import { EventDescriptionType } from "@/lib/api/events";

function displayDT(v: string) {
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d.toLocaleString();
  return v;
}

function formatRange(start?: string, end?: string) {
  const s = start ? displayDT(start) : "-";
  const e = end ? displayDT(end) : "-";
  return `${s} → ${e}`;
}

function toDisplayString(val: unknown): string {
  if (val == null) return "";
  const t = typeof val;
  if (t === "string" || t === "number" || t === "boolean") return String(val);
  if (Array.isArray(val)) return val.map((v) => toDisplayString(v)).filter(Boolean).join(", ");
  if (t === "object") {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

function renderDescription(items?: EventDescriptionItem[]) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {items.map((it, idx) => {
        switch (it.type) {
          case EventDescriptionType.Title:
            return (
              <h4 key={idx} className="text-primary-900 font-semibold">
                {toDisplayString(it.value)}
              </h4>
            );
          case EventDescriptionType.Paragraph:
            return (
              <p key={idx} className="text-primary-800 text-sm">
                {toDisplayString(it.value)}
              </p>
            );
          case EventDescriptionType.Banner: {
            const url = typeof it.value === "string" ? it.value : "";
            return url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={idx}
                src={url}
                alt="Event banner"
                className="w-full rounded-md border object-cover"
              />
            ) : null;
          }
          case EventDescriptionType.Quote:
            return (
              <blockquote key={idx} className="border-l-4 border-primary-300 pl-3 italic text-primary-800">
                {toDisplayString(it.value.text)}
              </blockquote>
            );
          case EventDescriptionType.List: {
            const arr = Array.isArray(it.value) ? it.value : [];
            return (
              <ul key={idx} className="list-disc pl-5 text-sm text-primary-800 space-y-1">
                {arr.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            );
          }
          // no default
        }
      })}
    </div>
  );
}

export default function EventsList({
  items,
  notifying,
  onEdit,
  onDelete,
  onNotify,
  selectedIds,
  onToggleSelect,
}: {
  items: WithId<EventDoc>[];
  notifying?: boolean;
  onEdit: (it: WithId<EventDoc>) => void;
  onDelete: (id: string) => void;
  onNotify?: (it: WithId<EventDoc>) => void;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}) {
  const selectable = typeof onToggleSelect === "function";
  const selected = new Set(selectedIds ?? []);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
      {items.map((it) => (
        <div
          key={it.id}
          className={`rounded-md border bg-white p-4 shadow-sm ${
            selected.has(it.id) ? "border-red-400 ring-1 ring-red-200" : "border-primary-200"
          }`}
        >
          {selectable && (
            <label className="mb-2 flex items-center gap-2 text-xs text-primary-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-primary-300 accent-red-600"
                checked={selected.has(it.id)}
                onChange={() => onToggleSelect?.(it.id)}
              />
              <span>Select</span>
            </label>
          )}
          <div className="flex items-start gap-3">
            {it.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.imageUrl} alt={it.title} className="h-10 w-10 rounded object-cover border" />
            ) : null}
            <div>
              <h3 className="text-base font-semibold text-primary-900">{it.title}</h3>
              <p className="text-xs text-primary-600">{it.category}</p>
              {it.programme && (
                <p className="text-xs text-primary-700">Programme: {it.programme}</p>
              )}
              {it.location?.primary && (
                <p className="text-xs text-primary-700">
                  {it.location.primary}
                  {it.location.secondary ? ` — ${it.location.secondary}` : ""}
                </p>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-primary-700">{formatRange(it.start_date_time, it.end_date_time)}</p>
          {it.short_description && (
            <p className="mt-2 text-sm text-primary-800">{it.short_description}</p>
          )}
          {renderDescription(it.description)}
          {it.tags && it.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {it.tags.map((t, i) => (
                <span key={i} className="inline-block rounded bg-primary-100 px-2 py-0.5 text-[11px] text-primary-700">
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <AppButton variant={AppButtonVariant.Edit} className="px-3 py-1 text-xs" onClick={() => onEdit(it)}>
              Edit
            </AppButton>
            <AppButton variant={AppButtonVariant.Delete} className="px-3 py-1 text-xs" onClick={() => onDelete(it.id)}>
              Delete
            </AppButton>
            {onNotify && (
              <NotifyButton
                onClick={() => onNotify(it)}
                disabled={notifying}
                className="px-3 py-1 text-xs"
              />
            )}
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <div className="col-span-full text-center text-primary-600 py-8">No events yet.</div>
      )}
    </div>
  );
}
