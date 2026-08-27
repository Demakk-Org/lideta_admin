"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/store";
import { fetchUsers, editUser } from "@/lib/redux/features/usersSlice";
import type { WithId, UserDoc } from "@/lib/api/users";
import Pagination from "@/components/ui/Pagination";
import PagedGridPage from "@/components/ui/PagedGridPage";
import { usePagedItems } from "@/lib/hooks/usePagedItems";
import UsersList from "./_components/UsersList";
import UsersFormModal from "./_components/UsersFormModal";

export default function UsersClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.users);
  const loading = status === "loading";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  // Safety: ensure body scroll isn't stuck from previous modals/HMR on page mount
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.style.overflow = "";
    }
  }, []);

  const openEdit = (it: WithId<UserDoc>) => {
    setEditingId(it.id);
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const initialItem = useMemo(
    () => (editingId ? items.find((x) => x.id === editingId) : undefined),
    [items, editingId]
  );

  const handleSubmit = async (payload: Partial<UserDoc>) => {
    if (!editingId) return;
    try {
      await dispatch(editUser({ id: editingId, data: payload })).unwrap();
      toast.success("User updated");
      setIsModalOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      toast.error(msg);
    }
  };

  const { pageItems, paginationProps } = usePagedItems(items, {
    pageSize: 10,
    pageSizeOptions: [10, 25, 50, 100],
  });

  return (
    <>
      <PagedGridPage
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-primary-800">Users</h2>
              <p className="text-sm text-primary-700">
                Manage users of the church app.
              </p>
            </div>
            <div className="flex items-center gap-3" />
          </div>
        }
        pager={<Pagination {...paginationProps} />}
      >
        <UsersList items={pageItems} loading={loading} onEdit={openEdit} />
      </PagedGridPage>

      <UsersFormModal
        open={isModalOpen}
        initial={initialItem}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />
    </>
  );
}
