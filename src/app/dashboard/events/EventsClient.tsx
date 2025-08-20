"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/store";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import { fetchEvents, createEvent, editEvent, removeEvent } from "@/lib/redux/features/eventsSlice";
import { fetchEventCategories } from "@/lib/redux/features/eventCategoriesSlice";
import type { WithId, EventDoc } from "@/lib/api/events";
import EventsList from "./_components/EventsList";
import EventsFormModal from "./_components/EventsFormModal";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
//

export default function EventsClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.events);
  const catState = useAppSelector((s) => s.eventCategories);
  const loading = status === "loading";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Filter: all / upcoming / past
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("all");

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchEvents());
    }
    if (catState.status === "idle") {
      dispatch(fetchEventCategories());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, catState.status]);

  // Safety: ensure body scroll isn't stuck from previous modals/HMR on page mount
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.style.overflow = "";
    }
  }, []);

  const categories = useMemo(() => catState.items.map((c) => c.name), [catState.items]);

  const openAdd = () => {
    setModalType("add");
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (it: WithId<EventDoc>) => {
    setModalType("edit");
    setEditingId(it.id);
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const initialItem = useMemo(() => (editingId ? items.find((x) => x.id === editingId) : undefined), [items, editingId]);

  const handleSubmit = async (payload: EventDoc) => {
    if (editingId) {
      await dispatch(editEvent({ id: editingId, data: payload })).unwrap();
      toast.success("Event updated");
    } else {
      await dispatch(createEvent(payload)).unwrap();
      toast.success("Event added");
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
      await dispatch(removeEvent(deleteId)).unwrap();
      toast.success("Event deleted");
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
        <h2 className="text-xl font-semibold text-primary-800">Events</h2>
        <div className="flex items-center gap-3">
          <label className="text-sm text-primary-700">
            <span className="mr-2">Filter:</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as "all" | "upcoming" | "past")}
              className="rounded-md border border-primary-300 bg-white px-2 py-1 text-sm"
            >
              <option value="all">All</option>
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
            </select>
          </label>
          <AppButton variant={AppButtonVariant.Add} onClick={openAdd} disabled={loading}>Add Event</AppButton>
        </div>
      </div>

      <EventsList
        items={useMemo(() => {
          const now = Date.now();
          if (filter === "all") return items;
          return items.filter((it) => {
            const tStr = it.end_date_time || it.start_date_time;
            if (!tStr) return filter === "past" ? false : true;
            const t = new Date(tStr as string).getTime();
            if (isNaN(t)) return true;
            return filter === "past" ? t < now : t >= now;
          });
        }, [items, filter])}
        onEdit={openEdit}
        onDelete={onDelete}
      />

      <EventsFormModal
        open={isModalOpen}
        mode={modalType}
        initial={initialItem}
        categories={categories}
        onClose={closeModal}
        onSubmit={handleSubmit}
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
