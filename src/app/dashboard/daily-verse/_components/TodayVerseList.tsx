"use client";

import { WithId, DailyVerse } from "@/lib/api/dailyVerse";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";

type Props = {
  items: WithId<DailyVerse>[];
  loading: boolean;
  onEdit: (v: WithId<DailyVerse>) => void;
  onDelete: (id: string) => void;
};

export default function TodayVerseList({ items, loading, onEdit, onDelete }: Props) {
  return (
    <div className="rounded-md border border-primary-100 bg-white/60 backdrop-blur">
      <div className="px-4 py-2 border-b border-primary-100 flex items-center justify-between">
        <h2 className="text-primary-800 font-semibold">Saved Verses</h2>
        {loading && <span className="text-sm text-primary-600">Loading...</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-primary-100">
          <thead className="bg-primary-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">Display Date</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">Reference</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">Text</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">Tag</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">Status</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-100">
            {items.map((v) => (
              <tr key={v.id} className="bg-white/60">
                <td className="px-4 py-2 text-sm text-primary-800">{`${v.display_date?.year}-${String(v.display_date?.month).padStart(2, "0")}-${String(v.display_date?.day).padStart(2, "0")}`}</td>
                <td className="px-4 py-2 text-sm text-primary-800">{v.reference}</td>
                <td className="px-4 py-2 text-sm text-primary-700 max-w-[420px] truncate" title={v.text}>{v.text}</td>
                <td className="px-4 py-2 text-sm text-primary-700">{v.tag || "-"}</td>
                <td className="px-4 py-2 text-sm">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v.status === "active" ? "bg-primary-100 text-primary-800" : "bg-primary-50 text-primary-700"}`}>
                    {v.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm">
                  <div className="flex gap-2">
                    <AppButton variant={AppButtonVariant.Edit} onClick={() => onEdit(v)} className="px-3 py-1">
                      Edit
                    </AppButton>
                    <AppButton variant={AppButtonVariant.Delete} onClick={() => onDelete(v.id)} className="px-3 py-1">
                      Delete
                    </AppButton>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-primary-700">No verses yet. Add one above.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
