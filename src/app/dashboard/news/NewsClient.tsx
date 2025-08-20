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

export default function NewsClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.news);
  const users = useAppSelector((s) => s.users.items);
  const loading = status === "loading";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-primary-800">News</h2>
        <div className="flex items-center gap-3">
          <AppButton variant={AppButtonVariant.Add} onClick={openAdd} disabled={loading}>Add News</AppButton>
        </div>
      </div>

      <NewsList items={items} users={users} onEdit={openEdit} onDelete={onDelete} />

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
    </div>
  );
}
