"use client";

import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import type { WithId, UserDoc } from "@/lib/api/users";
import { UserRole } from "@/lib/api/users";

export default function UsersList({
  items,
  loading,
  onEdit,
}: {
  items: WithId<UserDoc>[];
  loading: boolean;
  onEdit: (it: WithId<UserDoc>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
      {items.map((it) => (
        <div key={it.id} className="rounded-md border border-primary-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            {it.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.imageUrl} alt={it.name} className="h-10 w-10 rounded object-cover border" />
            ) : (
              <div className="h-10 w-10 rounded border bg-primary-50 flex items-center justify-center text-primary-600 text-sm">
                {it.name?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <div>
              <h3 className="text-base font-semibold text-primary-900">{it.name}</h3>
              <p className="text-xs text-primary-600">{it.email}</p>
              {it.role === UserRole.Admin ? (
                <span className="mt-1 inline-block rounded bg-primary-100 px-2 py-0.5 text-[11px] text-primary-700">
                  Admin
                </span>
              ) : (
                <span className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                  User
                </span>
              )}
            </div>
          </div>
          {typeof it.age === "number" && (
            <p className="mt-2 text-sm text-primary-800">Age: {it.age}</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <AppButton
              variant={AppButtonVariant.Edit}
              className="px-3 py-1 text-xs"
              onClick={() => onEdit(it)}
              disabled={loading}
            >
              Edit
            </AppButton>
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <div className="col-span-full text-center text-primary-600 py-8">No users found.</div>
      )}
    </div>
  );
}
