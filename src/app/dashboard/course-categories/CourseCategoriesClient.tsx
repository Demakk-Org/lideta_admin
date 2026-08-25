"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/store";
import AppModal from "@/components/ui/AppModal";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import FileUploadButton from "@/components/ui/FileUploadButton";
import { uploadCourseImage } from "@/lib/api/storage";
import {
  createCourseCategory,
  editCourseCategory,
  fetchCourseCategories,
  removeCourseCategory,
} from "@/lib/redux/features/courseCategoriesSlice";
import { fetchCourses } from "@/lib/redux/features/coursesSlice";
import type { CourseCategory, WithId } from "@/lib/api/courseCategories";

export default function CourseCategoriesClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.courseCategories);
  const courses = useAppSelector((s) => s.courses);
  const loading = status === "loading";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    dispatch(fetchCourseCategories());
    if (courses.status === "idle") dispatch(fetchCourses());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const openAdd = () => {
    setModalType("add");
    setEditingId(null);
    setName("");
    setDescription("");
    setImageUrl("");
    setIsModalOpen(true);
  };

  const openEdit = (it: WithId<CourseCategory>) => {
    setModalType("edit");
    setEditingId(it.id);
    setName(it.name ?? "");
    setDescription(it.description ?? "");
    setImageUrl(it.imageUrl ?? "");
    setIsModalOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!name.trim()) throw new Error("Category name is required");
      const data: CourseCategory = {
        name: name.trim(),
        description: description.trim(),
        imageUrl: imageUrl.trim(),
      };
      if (editingId) {
        await dispatch(editCourseCategory({ id: editingId, data })).unwrap();
        toast.success("Category updated");
      } else {
        await dispatch(createCourseCategory(data)).unwrap();
        toast.success("Category added");
      }
      setIsModalOpen(false);
      setEditingId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submit failed";
      toast.error(msg);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId || isDeleting) return;
    setIsDeleting(true);
    try {
      await dispatch(removeCourseCategory(deleteId)).unwrap();
      toast.success("Category deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
      setDeleteId(null);
    }
  };

  // Every category becomes a chip in the app, used or not.
  const usageCount = (categoryId: string) =>
    courses.items.filter((c) => c.categoryId === categoryId).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-primary-800">
          Course Categories
        </h2>
        <AppButton
          variant={AppButtonVariant.Add}
          onClick={openAdd}
          disabled={loading}
        >
          Add Category
        </AppButton>
      </div>

      <div className="rounded-md border border-primary-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-50 text-left text-primary-700">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Courses</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const used = usageCount(it.id);
              return (
                <tr key={it.id} className="border-t border-primary-200">
                  <td className="px-3 py-2 text-primary-900">
                    <div className="flex items-center gap-2">
                      {it.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.imageUrl}
                          alt=""
                          className="h-8 w-8 rounded border object-cover"
                        />
                      ) : null}
                      {it.name}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-primary-700">
                    {it.description || "—"}
                  </td>
                  <td className="px-3 py-2 text-primary-700">
                    {used === 0 ? (
                      <span className="text-amber-700">unused</span>
                    ) : (
                      used
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <AppButton
                        variant={AppButtonVariant.Edit}
                        className="px-3 py-1 text-xs"
                        onClick={() => openEdit(it)}
                      >
                        Edit
                      </AppButton>
                      <AppButton
                        variant={AppButtonVariant.Delete}
                        className="px-3 py-1 text-xs"
                        onClick={() => {
                          setDeleteId(it.id);
                          setIsDeleteOpen(true);
                        }}
                      >
                        Delete
                      </AppButton>
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-primary-600">
                  No course categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AppModal
        open={isModalOpen}
        type={modalType}
        onClose={() => setIsModalOpen(false)}
        title={modalType === "add" ? "Add Category" : "Edit Category"}
        footer={
          <AppButton
            type="submit"
            disabled={!name.trim()}
            variant={
              modalType === "add" ? AppButtonVariant.Add : AppButtonVariant.Edit
            }
            form="courseCategoryForm"
          >
            {modalType === "add" ? "Add" : "Save"}
          </AppButton>
        }
      >
        <form id="courseCategoryForm" onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary-800">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Foundations"
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
              placeholder="Core teaching for new members"
              rows={2}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">
              Image (optional)
            </label>
            <div className="mt-1 flex flex-col gap-2">
              <FileUploadButton
                label={uploading ? "Uploading..." : "Upload Image"}
                accept="image/*"
                disabled={uploading}
                onSelect={async (f) => {
                  try {
                    setUploading(true);
                    const url = await uploadCourseImage(f, name || "category");
                    setImageUrl(url);
                    toast.success("Image uploaded");
                  } catch {
                    toast.error("Image upload failed");
                  } finally {
                    setUploading(false);
                  }
                }}
              />
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="https://..."
              />
              {imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt="preview"
                  className="h-16 w-16 rounded border object-cover"
                />
              )}
            </div>
          </div>
        </form>
      </AppModal>

      <ConfirmDeleteModal
        open={isDeleteOpen}
        onCancel={() => {
          if (!isDeleting) {
            setIsDeleteOpen(false);
            setDeleteId(null);
          }
        }}
        onConfirm={confirmDelete}
        confirmLabel={isDeleting ? "Deleting..." : "Delete"}
        disabled={isDeleting}
      />
    </div>
  );
}
