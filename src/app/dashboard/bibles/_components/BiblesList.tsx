"use client";

import type { WithId, BibleSource } from "@/lib/api/bibles";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import { } from "react";

type Props = {
  items: WithId<BibleSource>[];
  loading: boolean;
  onEdit: (item: WithId<BibleSource>) => void;
  onDelete: (id: string) => void;
};

export default function BiblesList({ items, loading, onEdit, onDelete }: Props) {

  return (
    <div className="rounded-md border border-primary-100 bg-white/60 backdrop-blur">
      <div className="px-4 py-2 border-b border-primary-100 flex items-center justify-between">
        <h2 className="text-primary-800 font-semibold">Saved Bible Sources</h2>
        {loading && <span className="text-sm text-primary-600">Loading...</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-primary-100">
          <thead className="bg-primary-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">Lang</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">Short</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">Source URL</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-100">
            {items.map((it) => (
              <tr key={it.id} className="bg-white/60">
                <td className="px-4 py-2 text-sm text-primary-800">{it.lang}</td>
                <td className="px-4 py-2 text-sm text-primary-800">{it.name}</td>
                <td className="px-4 py-2 text-sm text-primary-700">{it.short_name}</td>
                <td className="px-4 py-2 text-sm max-w-[420px] truncate" title={it.source_url}>
                  <a href={it.source_url} target="_blank" rel="noreferrer" className="text-primary-700 underline">
                    {it.source_url}
                  </a>
                </td>
                <td className="px-4 py-2 text-sm">
                  <div className="flex gap-2">
                    <AppButton
                      variant={AppButtonVariant.Edit}
                      onClick={() => onEdit(it)}
                      className="px-3 py-1"
                    >
                      Edit
                    </AppButton>
                    <AppButton
                      variant={AppButtonVariant.Delete}
                      onClick={() => onDelete(it.id)}
                      className="px-3 py-1"
                    >
                      Delete
                    </AppButton>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-primary-700">
                  No bible sources yet. Add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
