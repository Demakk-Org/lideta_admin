"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/store";
import { AppButtonVariant } from "@/components/ui/AppButton";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import BiblesHeader from "./_components/BiblesHeader";
import BiblesList from "./_components/BiblesList";
import BiblesModal from "./_components/BiblesModal";
import type { BibleForm } from "./_components/types";
import type { BibleSource, WithId } from "@/lib/api/bibles";
import { fetchBibles, createBible, editBible, removeBible } from "@/lib/redux/features/biblesSlice";
import { uploadBibleJson } from "@/lib/api/storage";

const emptyForm: BibleForm = {
  lang: "",
  name: "",
  short_name: "",
  source_url: "",
  file: null,
};

export default function BiblesClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.bibles);
  const loading = status === "loading";

  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BibleForm>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      await dispatch(fetchBibles()).unwrap();
    } catch {
      toast.error("Failed to load bibles");
    }
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  

  const reset = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Basic validate
      if (!form.lang || !form.name || !form.short_name) {
        throw new Error("Fill language, name, and short name");
      }

      if (!form.source_url && !form.file) {
        throw new Error("Provide a Source URL or select a JSON file to upload");
      }

      let sourceUrl = form.source_url.trim();
      if (form.file) {
        // Optional: Validate file type
        if (form.file.type && !form.file.type.includes("json")) {
          throw new Error("Selected file must be a JSON file");
        }
        sourceUrl = await uploadBibleJson(form.file, form.lang, form.short_name);
      }

      const payload: Omit<BibleSource, "createdAt" | "updatedAt"> = {
        lang: form.lang.trim(),
        name: form.name.trim(),
        short_name: form.short_name.trim(),
        source_url: sourceUrl,
      };

      if (editingId) {
        await dispatch(editBible({ id: editingId, data: payload })).unwrap();
        toast.success("Bible updated");
      } else {
        await dispatch(createBible(payload)).unwrap();
        toast.success("Bible added");
      }
      reset();
      closeModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submit failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (it: WithId<BibleSource>) => {
    setEditingId(it.id);
    setForm({
      lang: it.lang ?? "",
      name: it.name ?? "",
      short_name: it.short_name ?? "",
      source_url: it.source_url ?? "",
      file: null,
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await dispatch(removeBible(deleteId)).unwrap();
      toast.success("Bible deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setIsDeleteOpen(false);
      setDeleteId(null);
    }
  };

  const submitLabel = editingId ? "Update Bible" : "Add Bible";
  const submitVariant = editingId ? AppButtonVariant.Edit : AppButtonVariant.Add;

  return (
    <div className="space-y-6">
      <BiblesHeader onAdd={openNew} />

      <BiblesModal
        isOpen={isModalOpen}
        form={form}
        setForm={setForm}
        submitting={submitting}
        submitLabel={submitLabel}
        submitVariant={submitVariant}
        onSubmit={handleSubmit}
        onClose={closeModal}
      />

      <BiblesList items={items} loading={loading} onEdit={handleEdit} onDelete={handleDelete} />

      <ConfirmDeleteModal
        open={isDeleteOpen}
        onCancel={() => {
          setIsDeleteOpen(false);
          setDeleteId(null);
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
