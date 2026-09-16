"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/store";
import AppModal from "@/components/ui/AppModal";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import Pagination from "@/components/ui/Pagination";
import PagedGridPage from "@/components/ui/PagedGridPage";
import DataTable from "@/components/ui/DataTable";
import { usePagedItems } from "@/lib/hooks/usePagedItems";
import {
  createQuizCategory,
  editQuizCategory,
  fetchQuizCategories,
  removeQuizCategory,
} from "@/lib/redux/features/quizCategoriesSlice";
import type { QuizCategory, WithId } from "@/lib/api/quizCategories";

function CategoriesList({
  items,
  onEdit,
  onDelete,
}: {
  items: WithId<QuizCategory>[];
  onEdit: (it: WithId<QuizCategory>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <DataTable
      rows={items}
      getKey={(it) => it.id}
      empty="No categories yet."
      columns={[
        { header: "Name", className: "text-primary-900", cell: (it) => it.name },
        {
          header: "Actions",
          className: "text-right",
          cell: (it) => (
            <div className="inline-flex gap-2">
              <AppButton
                variant={AppButtonVariant.Edit}
                className="px-3 py-1 text-xs"
                onClick={() => onEdit(it)}
              >
                Edit
              </AppButton>
              <AppButton
                variant={AppButtonVariant.Delete}
                className="px-3 py-1 text-xs"
                onClick={() => onDelete(it.id)}
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

export default function QuizCategoriesClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.quizCategories);
  const loading = status === "loading";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    dispatch(fetchQuizCategories());
  }, [dispatch]);

  const openAdd = () => {
    setModalType("add");
    setEditingId(null);
    setName("");
    setIsModalOpen(true);
  };

  const openEdit = (it: WithId<QuizCategory>) => {
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
        await dispatch(
          editQuizCategory({ id: editingId, data: { name: name.trim() } }),
        ).unwrap();
        toast.success("Category updated");
      } else {
        await dispatch(createQuizCategory({ name: name.trim() })).unwrap();
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
      await dispatch(removeQuizCategory(deleteId)).unwrap();
      toast.success("Category deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
      setDeleteId(null);
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
          <>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-primary-800">
              Quiz Categories
            </h2>
            <AppButton
              variant={AppButtonVariant.Add}
              onClick={openAdd}
              disabled={loading}
            >
              Add Category
            </AppButton>
          </div>
          </>
        }
        pager={<Pagination {...paginationProps} />}
      >
        <CategoriesList
          items={pageItems}
          onEdit={openEdit}
          onDelete={onDelete}
        />
      </PagedGridPage>

      <AppModal
        open={isModalOpen}
        type={modalType}
        onClose={closeModal}
        title={modalType === "add" ? "Add Category" : "Edit Category"}
        footer={
          <AppButton
            type="submit"
            disabled={!name.trim()}
            variant={
              modalType === "add" ? AppButtonVariant.Add : AppButtonVariant.Edit
            }
            form="quizCategoryForm"
          >
            {modalType === "add" ? "Add" : "Save"}
          </AppButton>
        }
      >
        <form id="quizCategoryForm" onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary-800">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Old Testament"
              required
            />
          </div>
        </form>
      </AppModal>

      <ConfirmDeleteModal
        open={isDeleteOpen}
        onCancel={() => {
          if (!isDeleting) setIsDeleteOpen(false);
        }}
        onConfirm={confirmDelete}
        confirmLabel={isDeleting ? "Deleting..." : "Delete"}
        disabled={isDeleting}
      />
    </>
  );
}
