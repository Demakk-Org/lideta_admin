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
import LocaleTabs, { LocaleChips } from "@/components/ui/LocaleTabs";
import Pagination from "@/components/ui/Pagination";
import PagedGridPage from "@/components/ui/PagedGridPage";
import DataTable from "@/components/ui/DataTable";
import { usePagedItems } from "@/lib/hooks/usePagedItems";
import {
  BASE_CONTENT_LOCALE,
  CONTENT_LOCALE_LABELS,
} from "@/lib/i18n/contentLocales";
import type { ContentLocale } from "@/lib/i18n/contentLocales";
import { displayText, localesOf } from "@/lib/i18n/localizedText";
import type { LocalizedText } from "@/lib/i18n/localizedText";
import type { CourseCategory, WithId } from "@/lib/api/courseCategories";

export default function CourseCategoriesClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.courseCategories);
  const courses = useAppSelector((s) => s.courses);
  const loading = status === "loading";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState<LocalizedText>({});
  const [description, setDescription] = useState<LocalizedText>({});
  const [languages, setLanguages] = useState<ContentLocale[]>([
    BASE_CONTENT_LOCALE,
  ]);
  const [activeLocale, setActiveLocale] =
    useState<ContentLocale>(BASE_CONTENT_LOCALE);
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
    setName({});
    setDescription({});
    setLanguages([BASE_CONTENT_LOCALE]);
    setActiveLocale(BASE_CONTENT_LOCALE);
    setImageUrl("");
    setIsModalOpen(true);
  };

  const openEdit = (it: WithId<CourseCategory>, addLanguage?: ContentLocale) => {
    setModalType("edit");
    setEditingId(it.id);
    const present = localesOf(it.name);
    const opened =
      addLanguage && !present.includes(addLanguage)
        ? [...present, addLanguage]
        : present;
    setName(it.name);
    setDescription(it.description);
    setLanguages(opened.length ? opened : [BASE_CONTENT_LOCALE]);
    // The list view's `+` opens straight onto the new language.
    setActiveLocale(addLanguage ?? BASE_CONTENT_LOCALE);
    setImageUrl(it.imageUrl ?? "");
    setIsModalOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!(name[BASE_CONTENT_LOCALE] ?? "").trim()) {
        throw new Error("Category name is required in English");
      }
      const data: CourseCategory = { name, description, imageUrl: imageUrl.trim() };
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

  const isPrimaryTab = activeLocale === BASE_CONTENT_LOCALE;

  const setLocalized = (
    setter: React.Dispatch<React.SetStateAction<LocalizedText>>,
    value: string,
  ) => setter((prev) => ({ ...prev, [activeLocale]: value }));

  const addLocale = (locale: ContentLocale) => {
    setLanguages((prev) => [...prev, locale]);
    setActiveLocale(locale);
  };

  const removeLocale = (locale: ContentLocale) => {
    if (locale === BASE_CONTENT_LOCALE) return;
    const drop = (prev: LocalizedText) => {
      const next = { ...prev };
      delete next[locale];
      return next;
    };
    setLanguages((prev) => prev.filter((l) => l !== locale));
    setName(drop);
    setDescription(drop);
    setActiveLocale(BASE_CONTENT_LOCALE);
  };

  const { pageItems, paginationProps } = usePagedItems(items, {
    pageSize: 10,
    pageSizeOptions: [10, 25, 50, 100],
  });

  // Every category becomes a chip in the app, used or not.
  const usageCount = (categoryId: string) =>
    courses.items.filter((c) => c.categoryId === categoryId).length;

  return (
    <>
      <PagedGridPage
        toolbar={
          <>
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
          </>
        }
        pager={<Pagination {...paginationProps} />}
      >
        <DataTable
          rows={pageItems}
          getKey={(it) => it.id}
          empty="No course categories yet."
          columns={[
            {
              header: "Name",
              cell: (it) => (
                <div className="flex items-center gap-2">
                  {it.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.imageUrl}
                      alt=""
                      className="h-8 w-8 rounded border object-cover"
                    />
                  ) : null}
                  {displayText(it.name) || it.id}
                  <LocaleChips
                    languages={localesOf(it.name)}
                    defaultLanguage={BASE_CONTENT_LOCALE}
                    onAdd={(locale) => openEdit(it, locale)}
                  />
                </div>
              ),
            },
            {
              header: "Description",
              cell: (it) => displayText(it.description) || "—",
            },
            {
              header: "Courses",
              cell: (it) =>
                usageCount(it.id) === 0 ? (
                  <span className="text-amber-700">unused</span>
                ) : (
                  usageCount(it.id)
                ),
            },
            {
              header: "Actions",
              className: "text-right",
              cell: (it) => (
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
              ),
            },
          ]}
        />
      </PagedGridPage>

      <AppModal
        open={isModalOpen}
        type={modalType}
        onClose={() => setIsModalOpen(false)}
        title={modalType === "add" ? "Add Category" : "Edit Category"}
        footer={
          <AppButton
            type="submit"
            disabled={!(name[BASE_CONTENT_LOCALE] ?? "").trim()}
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
            <LocaleTabs
              languages={languages}
              active={activeLocale}
              defaultLanguage={BASE_CONTENT_LOCALE}
              onChange={setActiveLocale}
              onAdd={addLocale}
              onRemove={removeLocale}
            />
            <div className="rounded-b-md rounded-tr-md border border-t-0 border-primary-200 p-3">
              <label className="block text-sm font-medium text-primary-800">
                Name ({CONTENT_LOCALE_LABELS[activeLocale]})
              </label>
              <input
                type="text"
                value={name[activeLocale] ?? ""}
                onChange={(e) => setLocalized(setName, e.target.value)}
                className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Foundations"
                required={activeLocale === BASE_CONTENT_LOCALE}
              />

              <label className="mt-3 block text-sm font-medium text-primary-800">
                Description ({CONTENT_LOCALE_LABELS[activeLocale]})
              </label>
              <textarea
                value={description[activeLocale] ?? ""}
                onChange={(e) => setLocalized(setDescription, e.target.value)}
                className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Core teaching for new members"
                rows={2}
              />

              <p className="mt-2 text-xs text-primary-600">
                {isPrimaryTab
                  ? "English is the name the dashboard sorts and joins on — it is required and is never replaced by a translation."
                  : "A label for the app. Leave it empty and members reading this language see the English name."}
              </p>
            </div>
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
                    const url = await uploadCourseImage(
                      f,
                      name[BASE_CONTENT_LOCALE] || "category",
                    );
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
    </>
  );
}
