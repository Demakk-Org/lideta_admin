"use client";

import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import type { WithId, AudioDoc } from "@/lib/api/audios";

export default function AudiosList({
  items,
  onEdit,
  onDelete,
}: {
  items: WithId<AudioDoc>[];
  onEdit: (it: WithId<AudioDoc>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
      {items.map((it) => (
        <div key={it.id} className="rounded-md border border-primary-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            {it.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.thumbnailUrl} alt={it.title} className="h-10 w-10 rounded object-cover border" />
            ) : null}
            <div>
              <h3 className="text-base font-semibold text-primary-900">{it.title}</h3>
              {it.audioBy && <p className="text-xs text-primary-600">By {it.audioBy}</p>}
              {it.uploadDate && (
                <p className="text-[11px] text-primary-500 mt-1">{new Date(it.uploadDate).toLocaleString()}</p>
              )}
            </div>
          </div>
          {it.description && <p className="mt-3 text-sm text-primary-700 line-clamp-2">{it.description}</p>}

          <div className="mt-3 flex items-center gap-2">
            <AppButton variant={AppButtonVariant.Edit} onClick={() => onEdit(it)}>Edit</AppButton>
            <AppButton variant={AppButtonVariant.Delete} onClick={() => onDelete(it.id)}>Delete</AppButton>
            {it.audioUrl && (
              <a href={it.audioUrl} target="_blank" rel="noreferrer" className="ml-auto text-sm text-primary-700 underline">Open</a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
