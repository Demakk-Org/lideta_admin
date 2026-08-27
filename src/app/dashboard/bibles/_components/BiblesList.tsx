"use client";

import type { WithId, BibleSource } from "@/lib/api/bibles";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import DataTable from "@/components/ui/DataTable";

type Props = {
  items: WithId<BibleSource>[];
  loading: boolean;
  onEdit: (item: WithId<BibleSource>) => void;
  onDelete: (id: string) => void;
};

export default function BiblesList({ items, loading, onEdit, onDelete }: Props) {
  return (
    <DataTable
      rows={items}
      getKey={(it) => it.id}
      empty={loading ? "Loading…" : "No bible sources yet. Add one above."}
      columns={[
        { header: "Lang", cell: (it) => it.lang },
        { header: "Name", cell: (it) => it.name },
        { header: "Short", className: "text-primary-700", cell: (it) => it.short_name },
        {
          header: "Source URL",
          className: "max-w-[420px] truncate",
          cell: (it) => (
            <a
              href={it.source_url}
              target="_blank"
              rel="noreferrer"
              title={it.source_url}
              className="text-primary-700 underline"
            >
              {it.source_url}
            </a>
          ),
        },
        {
          header: "Actions",
          cell: (it) => (
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
          ),
        },
      ]}
    />
  );
}
