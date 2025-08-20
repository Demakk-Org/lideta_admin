"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/store";
import AppModal from "@/components/ui/AppModal";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import { fetchEventCategories, createEventCategory, editEventCategory, removeEventCategory } from "@/lib/redux/features/eventCategoriesSlice";
import type { WithId, EventCategory } from "@/lib/api/eventCategories";

function CategoriesList({ items, onEdit, onDelete }: { items: WithId<EventCategory>[]; onEdit: (it: WithId<EventCategory>) => void; onDelete: (id: string) => void; }) {
  return (
    <div className="rounded-md border border-primary-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-50 text-left text-primary-700">
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-t border-primary-200">
              <td className="px-3 py-2 text-primary-900">{it.name}</td>
              <td className="px-3 py-2 text-right">
                <div className="inline-flex gap-2">
                  <AppButton variant={AppButtonVariant.Edit} className="px-3 py-1 text-xs" onClick={() => onEdit(it)}>Edit</AppButton>
                  <AppButton variant={AppButtonVariant.Delete} className="px-3 py-1 text-xs" onClick={() => onDelete(it.id)}>Delete</AppButton>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={2} className="px-3 py-6 text-center text-primary-600">No categories yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function EventCategoriesClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.eventCategories);
  const loading = status === "loading";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    dispatch(fetchEventCategories());
  }, [dispatch]);

  const openAdd = () => {
    setModalType("add");
    setEditingId(null);
    setName("");
    setIsModalOpen(true);
  };

  const openEdit = (it: WithId<EventCategory>) => {
    setModalType("edit");
    setEditingId(it.id);
    setName(it.name ?? "");
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!name.trim()) throw new Error("Category name is required");
      if (editingId) {
        await dispatch(editEventCategory({ id: editingId, data: { name: name.trim() } })).unwrap();
        toast.success("Category updated");
      } else {
        await dispatch(createEventCategory({ name: name.trim() })).unwrap();
        toast.success("Category added");
      }
      setIsModalOpen(false);
      setName("");
      setEditingId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submit failed";
      toast.error(msg);
    }
  };

  const onDelete = (id: string) => {
    setDeleteId(id);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId || isDeleting) return;
    setIsDeleting(true);
    try {
      await dispatch(removeEventCategory(deleteId)).unwrap();
      toast.success("Category deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-primary-800">Event Categories</h2>
        <AppButton variant={AppButtonVariant.Add} onClick={openAdd} disabled={loading}>Add Category</AppButton>
      </div>

      <CategoriesList items={items} onEdit={openEdit} onDelete={onDelete} />

      {/* Add/Edit Modal */}
      <AppModal
        open={isModalOpen}
        type={modalType}
        onClose={closeModal}
        title={modalType === "add" ? "Add Category" : "Edit Category"}
        footer={
          <AppButton
            type="submit"
            disabled={!name.trim()}
            variant={modalType === "add" ? AppButtonVariant.Add : AppButtonVariant.Edit}
            form="eventCategoryForm"
          >
            {modalType === "add" ? "Add" : "Save"}
          </AppButton>
        }
      >
        <form id="eventCategoryForm" onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary-800">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Sermon"
              required
            />
          </div>
        </form>
      </AppModal>

      {/* Delete Modal */}
      <ConfirmDeleteModal
        open={isDeleteOpen}
        onCancel={() => {
          if (!isDeleting) setIsDeleteOpen(false);
        }}
        onConfirm={confirmDelete}
        confirmLabel={isDeleting ? "Deleting..." : "Delete"}
        disabled={isDeleting}
      />
    </div>
  );
}
