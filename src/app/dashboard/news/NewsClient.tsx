"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/store";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import { fetchNews, createNews, editNews, removeNews } from "@/lib/redux/features/newsSlice";
import { fetchUsers } from "@/lib/redux/features/usersSlice";
import type { WithId, NewsDoc } from "@/lib/api/news";
import NewsList from "./_components/NewsList";
import NewsFormModal from "./_components/NewsFormModal";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { useContentNotification } from "@/lib/notifications/useContentNotification";

export default function NewsClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.news);
  const users = useAppSelector((s) => s.users.items);
  const loading = status === "loading";
  const { notifying, notify } = useContentNotification();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  useEffect(() => {
    dispatch(fetchNews());
    dispatch(fetchUsers());
  }, [dispatch]);

  // Safety: ensure body scroll isn't stuck from previous modals/HMR on page mount
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.style.overflow = "";
    }
  }, []);

  // Drop selections for items that no longer exist (e.g. after deletion)
  useEffect(() => {
    setSelectedIds((prev) => {
      const existing = new Set(items.map((it) => it.id));
      const next = prev.filter((id) => existing.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [items]);

  const openAdd = () => {
    setModalType("add");
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (it: WithId<NewsDoc>) => {
    setModalType("edit");
    setEditingId(it.id);
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const initialItem = useMemo(() => (editingId ? items.find((x) => x.id === editingId) : undefined), [items, editingId]);

  const handleSubmit = async (payload: NewsDoc) => {
    if (editingId) {
      await dispatch(editNews({ id: editingId, data: payload })).unwrap();
      toast.success("News updated");
    } else {
      await dispatch(createNews(payload)).unwrap();
      toast.success("News added");
    }
    setIsModalOpen(false);
  };

  const onDelete = (id: string) => {
    setDeleteId(id);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await dispatch(removeNews(deleteId)).unwrap();
      toast.success("News deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setIsDeleteOpen(false);
      setDeleteId(null);
    }
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const allSelected = items.length > 0 && selectedIds.length === items.length;

  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : items.map((it) => it.id));

  const confirmBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    setBatchDeleting(true);
    const results = await Promise.allSettled(
      selectedIds.map((id) => dispatch(removeNews(id)).unwrap())
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = results.length - failed;
    if (succeeded > 0) toast.success(`${succeeded} news deleted`);
    if (failed > 0) toast.error(`${failed} failed to delete`);
    setBatchDeleting(false);
    setIsBatchDeleteOpen(false);
    setSelectedIds([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-primary-800">News</h2>
        <div className="flex flex-wrap items-center gap-3">
          {items.length > 0 && (
            <>
              <label className="flex items-center gap-2 text-sm text-primary-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-primary-300 accent-red-600"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
                <span>Select all</span>
              </label>
              {selectedIds.length > 0 && (
                <AppButton
                  variant={AppButtonVariant.Delete}
                  className="px-3 py-1 text-xs"
                  onClick={() => setIsBatchDeleteOpen(true)}
                  disabled={batchDeleting}
                >
                  Delete Selected ({selectedIds.length})
                </AppButton>
              )}
            </>
          )}
          <AppButton variant={AppButtonVariant.Add} onClick={openAdd} disabled={loading}>Add News</AppButton>
        </div>
      </div>

      <NewsList
        items={items}
        users={users}
        notifying={notifying}
        onEdit={openEdit}
        onDelete={onDelete}
        onNotify={(it) =>
          notify({
            type: "news",
            id: it.id,
            title: it.title,
            imageUrl: it.imageUrl,
          })
        }
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
      />

      <NewsFormModal
        open={isModalOpen}
        mode={modalType}
        initial={initialItem}
        onClose={closeModal}
        onSubmit={handleSubmit}
        users={users}
      />

      {/* Delete Modal */}
      <ConfirmDeleteModal
        open={isDeleteOpen}
        onCancel={() => {
          setIsDeleteOpen(false);
          setDeleteId(null);
        }}
        onConfirm={confirmDelete}
        confirmLabel="Delete"
      />

      {/* Batch Delete Modal */}
      <ConfirmDeleteModal
        open={isBatchDeleteOpen}
        title={`Delete ${selectedIds.length} selected news item${selectedIds.length === 1 ? "" : "s"}?`}
        onCancel={() => setIsBatchDeleteOpen(false)}
        onConfirm={confirmBatchDelete}
        confirmLabel={batchDeleting ? "Deleting..." : "Delete All"}
        disabled={batchDeleting}
      />
    </div>
  );
}
