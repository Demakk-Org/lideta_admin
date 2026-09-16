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
import {
  createBibleStudy,
  editBibleStudy,
  fetchBibleStudies,
  removeBibleStudy,
} from "@/lib/redux/features/bibleStudiesSlice";
import { fetchBibleStudyCategories } from "@/lib/redux/features/bibleStudyCategoriesSlice";
import type {
  BibleStudy,
  StudyMaterial,
  Verse,
  WithId,
} from "@/lib/api/bibleStudies";
import { verseReference } from "@/lib/api/bibleStudies";
import StudyMaterialsEditor from "./_components/StudyMaterialsEditor";
import KeyVersesEditor from "./_components/KeyVersesEditor";
import StudyPlansModal from "./_components/StudyPlansModal";

function StudiesList({
  items,
  categoryTitleById,
  onEdit,
  onDelete,
  onManagePlans,
}: {
  items: WithId<BibleStudy>[];
  categoryTitleById: Record<string, string>;
  onEdit: (it: WithId<BibleStudy>) => void;
  onDelete: (id: string) => void;
  onManagePlans: (it: WithId<BibleStudy>) => void;
}) {
  if (items.length === 0) return <EmptyGrid>No bible studies yet.</EmptyGrid>;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
      {items.map((it) => (
        <div
          key={it.id}
          className="rounded-md border border-primary-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-primary-900">
              {it.topicTitle}
            </h3>
            {it.hasQuiz && (
              <span className="shrink-0 rounded bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                Quiz
              </span>
            )}
          </div>
          {categoryTitleById[it.categoryId] && (
            <p className="text-xs text-primary-600">
              {categoryTitleById[it.categoryId]}
            </p>
          )}
          {it.description && (
            <p className="mt-2 line-clamp-3 text-sm text-primary-800">
              {it.description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
            <span className="inline-block rounded bg-primary-50 px-2 py-0.5 text-primary-700">
              {it.materials.length} materials
            </span>
            <span className="inline-block rounded bg-primary-50 px-2 py-0.5 text-primary-700">
              {it.keyVerses.length} key verses
            </span>
            <span className="inline-block rounded bg-primary-50 px-2 py-0.5 text-primary-700">
              {it.studyPlans.length} plans
            </span>
          </div>
          <p className="mt-2 break-all text-[11px] text-primary-500">
            id: {it.id}
          </p>
          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onManagePlans(it)}
              className="inline-flex items-center gap-1 rounded-md border border-primary-300 bg-white px-3 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50"
            >
              Plans
              <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">
                {it.studyPlans.length}
              </span>
            </button>
            <div className="flex gap-2">
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
        </div>
      ))}
    </div>
  );
}

export default function BibleStudiesClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.bibleStudies);
  const catState = useAppSelector((s) => s.bibleStudyCategories);
  const loading = status === "loading";

  const categoryTitleById = Object.fromEntries(
    catState.items.map((c) => [c.id, c.title]),
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [topicTitle, setTopicTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [keyVerses, setKeyVerses] = useState<Verse[]>([]);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Study plans are managed in their own modal, on an existing study.
  const [plansStudy, setPlansStudy] = useState<WithId<BibleStudy> | null>(null);

  useEffect(() => {
    if (status === "idle") dispatch(fetchBibleStudies());
    if (catState.status === "idle") dispatch(fetchBibleStudyCategories());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, catState.status]);

  const resetForm = () => {
    setTopicTitle("");
    setDescription("");
    setCategoryId("");
    setMaterials([]);
    setKeyVerses([]);
    setEditingId(null);
  };

  const openAdd = () => {
    setModalType("add");
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (it: WithId<BibleStudy>) => {
    setModalType("edit");
    setEditingId(it.id);
    setTopicTitle(it.topicTitle ?? "");
    setDescription(it.description ?? "");
    setCategoryId(it.categoryId ?? "");
    setMaterials(it.materials ?? []);
    setKeyVerses(it.keyVerses ?? []);
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!topicTitle.trim()) throw new Error("Topic title is required");
      if (!description.trim()) throw new Error("Description is required");
      const cat = catState.items.find((c) => c.id === categoryId);
      if (!cat) throw new Error("A category is required");

      const payload = {
        topicTitle: topicTitle.trim(),
        description: description.trim(),
        materials,
        keyVerses,
        categoryId: cat.id,
      };

      if (editingId) {
        await dispatch(editBibleStudy({ id: editingId, data: payload })).unwrap();
        toast.success("Bible study updated");
      } else {
        await dispatch(createBibleStudy(payload)).unwrap();
        toast.success("Bible study added");
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
      await dispatch(removeBibleStudy(deleteId)).unwrap();
      toast.success("Bible study deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
      setDeleteId(null);
    }
  };

  const { pageItems, paginationProps } = usePagedItems(items);

  return (
    <>
      <PagedGridPage
        toolbar={
          <>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-primary-800">Bible Studies</h2>
            <AppButton
              variant={AppButtonVariant.Add}
              onClick={openAdd}
              disabled={loading}
            >
              Add Study
            </AppButton>
          </div>
          </>
        }
        pager={<Pagination {...paginationProps} />}
      >
        <StudiesList
          items={pageItems}
          categoryTitleById={categoryTitleById}
          onEdit={openEdit}
          onDelete={onDelete}
          onManagePlans={(it) => setPlansStudy(it)}
        />
      </PagedGridPage>

      <AppModal
        open={isModalOpen}
        type={modalType}
        onClose={closeModal}
        title={modalType === "add" ? "Add Bible Study" : "Edit Bible Study"}
        footer={
          <AppButton
            type="submit"
            disabled={!topicTitle.trim() || !description.trim() || !categoryId}
            variant={
              modalType === "add" ? AppButtonVariant.Add : AppButtonVariant.Edit
            }
            form="bibleStudyForm"
          >
            {modalType === "add" ? "Add" : "Save"}
          </AppButton>
        }
      >
        <form id="bibleStudyForm" onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary-800">
              Topic Title
            </label>
            <input
              type="text"
              value={topicTitle}
              onChange={(e) => setTopicTitle(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="The Sermon on the Mount"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">
              Category
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="">Select category</option>
              {catState.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            {catState.items.length === 0 && (
              <p className="mt-1 text-xs text-primary-600">
                Create a bible study category first.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="An in-depth look at Jesus' teaching in Matthew 5-7."
              rows={3}
              required
            />
          </div>
          <StudyMaterialsEditor
            items={materials}
            onChange={setMaterials}
            studyTitle={topicTitle}
          />

          <KeyVersesEditor items={keyVerses} onChange={setKeyVerses} />

          {keyVerses.length > 0 && (
            <p className="text-[11px] text-primary-500">
              {keyVerses.map((v) => verseReference(v)).join(" · ")}
            </p>
          )}

          <p className="text-xs text-primary-600">
            Study plans are managed from the <strong>Plans</strong> button on the
            study card.
          </p>
        </form>
      </AppModal>

      <StudyPlansModal
        open={!!plansStudy}
        studyId={plansStudy?.id ?? null}
        studyTitle={plansStudy?.topicTitle}
        onClose={() => setPlansStudy(null)}
        onChanged={() => dispatch(fetchBibleStudies())}
      />

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
