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
    <div className="rounded-md border border-primary-100 bg-white/60 backdrop-blur">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-primary-100">
          <thead className="bg-primary-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">User</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">Email</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">Age</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">Role</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-primary-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-100">
            {items.map((it) => (
              <tr key={it.id} className="bg-white/60">
                <td className="px-4 py-2 text-sm text-primary-900 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    {it.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.imageUrl}
                        alt={it.name}
                        className="h-8 w-8 rounded object-cover border"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded border bg-primary-50 flex items-center justify-center text-primary-600 text-xs">
                        {it.name?.[0]?.toUpperCase() || "U"}
                      </div>
                    )}
                    <span className="font-medium">{it.name || "-"}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-sm text-primary-700">{it.email || "-"}</td>
                <td className="px-4 py-2 text-sm text-primary-700 whitespace-nowrap">
                  {typeof it.age === "number" ? it.age : "-"}
                </td>
                <td className="px-4 py-2 text-sm">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      it.role === UserRole.Admin
                        ? "bg-primary-100 text-primary-800"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {it.role === UserRole.Admin ? "Admin" : "User"}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm">
                  <AppButton
                    variant={AppButtonVariant.Edit}
                    className="px-3 py-1 text-xs"
                    onClick={() => onEdit(it)}
                    disabled={loading}
                  >
                    Edit
                  </AppButton>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-primary-700">
                  {loading ? "Loading..." : "No users found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
