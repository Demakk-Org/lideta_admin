"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/store";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import { fetchAudios, createAudio, editAudio, removeAudio } from "@/lib/redux/features/audiosSlice";
import type { WithId, AudioDoc } from "@/lib/api/audios";
import AudiosList from "./_components/AudiosList";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import AudiosFormModal from "./_components/AudiosFormModal";

export default function AudiosClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.audios);
  const loading = status === "loading";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchAudios());
  }, [dispatch]);

  useEffect(() => {
    if (typeof document !== "undefined") document.body.style.overflow = "";
  }, []);

  const openAdd = () => {
    setModalType("add");
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (it: WithId<AudioDoc>) => {
    setModalType("edit");
    setEditingId(it.id);
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const initialItem = useMemo(() => (editingId ? items.find((x) => x.id === editingId) : undefined), [items, editingId]);

  const handleSubmit = async (payload: AudioDoc) => {
    if (editingId) {
      await dispatch(editAudio({ id: editingId, data: payload })).unwrap();
      toast.success("Audio updated");
    } else {
      await dispatch(createAudio(payload)).unwrap();
      toast.success("Audio added");
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
      await dispatch(removeAudio(deleteId)).unwrap();
      toast.success("Audio deleted");
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
        <h2 className="text-xl font-semibold text-primary-800">Audios</h2>
        <div className="flex items-center gap-3">
          <AppButton variant={AppButtonVariant.Add} onClick={openAdd} disabled={loading}>Add Audio</AppButton>
        </div>
      </div>

      <AudiosList items={items} onEdit={openEdit} onDelete={onDelete} />

      <AudiosFormModal
        open={isModalOpen}
        mode={modalType}
        initial={initialItem}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />

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
