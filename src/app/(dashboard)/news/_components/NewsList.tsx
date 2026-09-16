"use client";

import { useState } from "react";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import AppModal from "@/components/ui/AppModal";
import DevicePreviewSelector, {
  DEFAULT_PREVIEW_DEVICE,
  previewWidthClass,
  type PreviewDevice,
} from "@/components/ui/DevicePreviewSelector";
import NotifyButton from "@/components/ui/NotifyButton";
import { EmptyGrid } from "@/components/ui/PagedGridPage";
import type { WithId, NewsDoc, NewsContentItem, NewsQuoteValue } from "@/lib/api/news";
import type { WithId as WithUserId, UserDoc } from "@/lib/api/users";
import { NewsContentType } from "@/lib/api/news";

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

function AuthorBadge({ author }: { author?: WithUserId<UserDoc> }) {
  if (!author) return null;
  return (
    <div className="mt-1 flex items-center gap-2">
      {author.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={author.imageUrl} alt={author.name} className="h-5 w-5 rounded object-cover border" />
      ) : (
        <div className="h-5 w-5 rounded border bg-primary-50 flex items-center justify-center text-[10px] text-primary-600">
          {(author.name?.[0] || "U").toUpperCase()}
        </div>
      )}
      <span className="text-[12px] text-primary-700">{author.name || author.email}</span>
    </div>
  );
}

function renderContent(items?: NewsContentItem[]) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {items.map((it, idx) => {
        switch (it.type) {
          case NewsContentType.Title:
            return (
              <h4 key={idx} className="text-primary-900 font-semibold">
                {toDisplayString(it.value)}
              </h4>
            );
          case NewsContentType.Paragraph:
            return (
              <p key={idx} className="text-primary-800 text-sm">
                {toDisplayString(it.value)}
              </p>
            );
          case NewsContentType.Banner: {
            const url = typeof it.value === "string" ? it.value : "";
            return url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={idx}
                src={url}
                alt="News banner"
                className="w-full rounded-md border object-cover"
              />
            ) : null;
          }
          case NewsContentType.Quote: {
            const q = it.value as NewsQuoteValue;
            return (
              <blockquote key={idx} className="border-l-4 border-primary-300 pl-3 italic text-primary-800">
                {toDisplayString(q?.text)}
              </blockquote>
            );
          }
          case NewsContentType.List: {
            const arr = Array.isArray(it.value) ? it.value : [];
            return (
              <ul key={idx} className="list-disc pl-5 text-sm text-primary-800 space-y-1">
                {arr.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            );
          }
        }
      })}
    </div>
  );
}

export default function NewsList({
  items,
  users,
  notifying,
  onEdit,
  onDelete,
  onNotify,
  selectedIds,
  onToggleSelect,
}: {
  items: WithId<NewsDoc>[];
  users: WithUserId<UserDoc>[];
  notifying?: boolean;
  onEdit: (it: WithId<NewsDoc>) => void;
  onDelete: (id: string) => void;
  onNotify?: (it: WithId<NewsDoc>) => void;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}) {
  const selectable = typeof onToggleSelect === "function";
  const selected = new Set(selectedIds ?? []);

  const [detail, setDetail] = useState<WithId<NewsDoc> | null>(null);
  const [device, setDevice] = useState<PreviewDevice>(DEFAULT_PREVIEW_DEVICE);

  return (
    <>
      {items.length === 0 ? (
        <EmptyGrid>No news yet.</EmptyGrid>
      ) : (
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
            <button
              type="button"
              onClick={() => setDetail(it)}
              className="block w-full cursor-pointer text-left"
              title="View full news"
            >
              <div className="flex items-start gap-3">
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.imageUrl} alt={it.title} className="h-10 w-10 rounded object-cover border" />
                ) : null}
                <div>
                  <h3 className="text-base font-semibold text-primary-900">{it.title}</h3>
                  <p className="text-xs text-primary-600">{it.category}</p>
                  <AuthorBadge author={users.find((u) => u.id === it.author_id)} />
                  {it.status && (
                    <p className="text-[11px] inline-block rounded bg-primary-100 px-2 py-0.5 text-primary-700 mt-1">
                      {it.status}
                    </p>
                  )}
                  {it.createdAt && (
                    <p className="text-[11px] text-primary-500 mt-1">{new Date(it.createdAt).toLocaleString()}</p>
                  )}
                </div>
              </div>
              {it.short_description && (
                <p className="mt-2 line-clamp-3 text-sm text-primary-800">{it.short_description}</p>
              )}
              <span className="mt-2 inline-block text-xs font-medium text-primary-700 underline">
                Read more
              </span>
            </button>
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
      </div>
      )}

      <AppModal
        open={!!detail}
        type="edit"
        title={detail?.title ?? "News"}
        widthClass={previewWidthClass(device)}
        cancelLabel="Close"
        onClose={() => setDetail(null)}
      >
        {detail && (
          <div>
            <DevicePreviewSelector value={device} onChange={setDevice} className="mb-3 w-fit" />
            {detail.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={detail.imageUrl}
                alt={detail.title}
                className="mb-3 max-h-64 w-full rounded-md border object-cover"
              />
            ) : null}
            <p className="text-xs text-primary-600">{detail.category}</p>
            <AuthorBadge author={users.find((u) => u.id === detail.author_id)} />
            {detail.status && (
              <p className="mt-1 inline-block rounded bg-primary-100 px-2 py-0.5 text-[11px] text-primary-700">
                {detail.status}
              </p>
            )}
            {detail.createdAt && (
              <p className="mt-1 text-[11px] text-primary-500">{new Date(detail.createdAt).toLocaleString()}</p>
            )}
            {detail.short_description && (
              <p className="mt-3 text-sm text-primary-800">{detail.short_description}</p>
            )}
            {renderContent(detail.content)}
            {detail.tags && detail.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1">
                {detail.tags.map((t, i) => (
                  <span key={i} className="inline-block rounded bg-primary-100 px-2 py-0.5 text-[11px] text-primary-700">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </AppModal>
    </>
  );
}
