"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/store";
import AppModal from "@/components/ui/AppModal";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import Pagination from "@/components/ui/Pagination";
import PagedGridPage, { EmptyGrid } from "@/components/ui/PagedGridPage";
import { usePagedItems } from "@/lib/hooks/usePagedItems";
import FileUploadButton from "@/components/ui/FileUploadButton";
import { uploadBibleStudyImage } from "@/lib/api/storage";
import {
  createBibleStudyCategory,
  editBibleStudyCategory,
  fetchBibleStudyCategories,
  recountBibleStudyCategories,
  removeBibleStudyCategory,
} from "@/lib/redux/features/bibleStudyCategoriesSlice";
import type {
  BibleStudyCategory,
  WithId,
} from "@/lib/api/bibleStudyCategories";

function CategoriesList({
  items,
  onEdit,
  onDelete,
}: {
  items: WithId<BibleStudyCategory>[];
  onEdit: (it: WithId<BibleStudyCategory>) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) {
    return <EmptyGrid>No bible study categories yet.</EmptyGrid>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
      {items.map((it) => (
        <div
          key={it.id}
          className="rounded-md border border-primary-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            {it.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={it.imageUrl}
                alt={it.title}
                className="h-12 w-12 shrink-0 rounded object-cover border"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-primary-200 bg-primary-50 text-xs text-primary-500">
                No img
              </div>
            )}
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-primary-900">
                {it.title}
              </h3>
              <p className="text-xs text-primary-600">
                {it.studyCount} {it.studyCount === 1 ? "study" : "studies"}
              </p>
            </div>
          </div>
          {it.description && (
            <p className="mt-2 line-clamp-3 text-sm text-primary-800">
              {it.description}
            </p>
          )}
          {it.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {it.tags.map((t) => (
                <span
                  key={t}
                  className="inline-block rounded bg-primary-50 px-2 py-0.5 text-[11px] text-primary-700"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
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
        </div>
      ))}
    </div>
  );
}

export default function BibleStudyCategoriesClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.bibleStudyCategories);
  const loading = status === "loading";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImg, setUploadingImg] = useState(false);
  const [tagsText, setTagsText] = useState("");

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRecounting, setIsRecounting] = useState(false);

  useEffect(() => {
    dispatch(fetchBibleStudyCategories());
  }, [dispatch]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setImageUrl("");
    setTagsText("");
    setEditingId(null);
  };

  const openAdd = () => {
    setModalType("add");
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (it: WithId<BibleStudyCategory>) => {
    setModalType("edit");
    setEditingId(it.id);
    setTitle(it.title ?? "");
    setDescription(it.description ?? "");
    setImageUrl(it.imageUrl ?? "");
    setTagsText((it.tags ?? []).join(", "));
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!title.trim()) throw new Error("Title is required");
      if (!description.trim()) throw new Error("Description is required");

      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        title: title.trim(),
        description: description.trim(),
        imageUrl: imageUrl.trim() || undefined,
        tags,
      };

      if (editingId) {
        await dispatch(
          editBibleStudyCategory({ id: editingId, data: payload }),
        ).unwrap();
        toast.success("Category updated");
      } else {
        await dispatch(createBibleStudyCategory(payload)).unwrap();
        toast.success("Category added");
      }
      setIsModalOpen(false);
      resetForm();
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
      await dispatch(removeBibleStudyCategory(deleteId)).unwrap();
      toast.success("Category deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
      setDeleteId(null);
    }
  };

  const handleRecount = async () => {
    if (isRecounting) return;
    setIsRecounting(true);
    try {
      await dispatch(recountBibleStudyCategories()).unwrap();
      toast.success("Study counts recomputed");
    } catch {
      toast.error("Recount failed");
    } finally {
      setIsRecounting(false);
    }
  };

  const { pageItems, paginationProps } = usePagedItems(items);

  return (
    <>
      <PagedGridPage
        toolbar={
          <>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-primary-800">
              Bible Study Categories
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRecount}
                disabled={isRecounting || loading}
                className="inline-flex items-center justify-center rounded-md border border-primary-300 bg-white px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
                title="Recompute study counts from the studies collection"
              >
                {isRecounting ? "Recounting..." : "Recount"}
              </button>
              <AppButton
                variant={AppButtonVariant.Add}
                onClick={openAdd}
                disabled={loading}
              >
                Add Category
              </AppButton>
            </div>
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
            disabled={!title.trim() || !description.trim()}
            variant={
              modalType === "add" ? AppButtonVariant.Add : AppButtonVariant.Edit
            }
            form="bibleStudyCategoryForm"
          >
            {modalType === "add" ? "Add" : "Save"}
          </AppButton>
        }
      >
        <form
          id="bibleStudyCategoryForm"
          onSubmit={submit}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-primary-800">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Foundations of Faith"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Studies covering the core doctrines of the Christian faith."
              rows={3}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">
              Image (optional)
            </label>
            <div className="mt-1 flex flex-col gap-3">
              <FileUploadButton
                label={uploadingImg ? "Uploading..." : "Upload Image"}
                accept="image/*"
                disabled={uploadingImg}
                onSelect={async (f) => {
                  try {
                    setUploadingImg(true);
                    const url = await uploadBibleStudyImage(f, title || "category");
                    setImageUrl(url);
                    toast.success("Image uploaded");
                  } catch {
                    toast.error("Image upload failed");
                  } finally {
                    setUploadingImg(false);
                  }
                }}
              />
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="flex-1 rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="https://..."
              />
              {imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt="preview"
                  className="h-10 w-10 rounded object-cover border"
                />
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Doctrine, Beginner, New Testament"
            />
          </div>
          <p className="text-xs text-primary-600">
            Study count is calculated automatically from the studies in this
            category.
          </p>
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
