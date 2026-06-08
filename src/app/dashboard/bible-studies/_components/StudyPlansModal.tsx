"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import AppModal from "@/components/ui/AppModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import DraggableList from "@/components/ui/DraggableList";
import { listStudyPlans, saveStudyPlans } from "@/lib/api/bibleStudies";
import type { StudyPlan } from "@/lib/api/bibleStudies";
import StudyPlanFormModal from "./StudyPlanFormModal";

type Row = { key: string; plan: StudyPlan };

export default function StudyPlansModal({
  open,
  studyId,
  studyTitle,
  onClose,
  onChanged,
}: {
  open: boolean;
  studyId: string | null;
  studyTitle?: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const [deleteKey, setDeleteKey] = useState<string | null>(null);

  const keyCounter = useRef(0);
  const nextKey = () => `p${keyCounter.current++}`;

  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  const refresh = useCallback(async () => {
    if (!studyId) return;
    setLoading(true);
    try {
      const plans = await listStudyPlans(studyId);
      setRows(plans.map((plan) => ({ key: nextKey(), plan })));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load plans";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [studyId]);

  useEffect(() => {
    if (open && studyId) {
      void refresh();
    } else {
      setRows([]);
    }
  }, [open, studyId, refresh]);

  // Persist the given rows to Firestore, update local state, and notify parent.
  const persist = async (nextRows: Row[]) => {
    if (!studyId) return;
    setSaving(true);
    try {
      await saveStudyPlans(
        studyId,
        nextRows.map((r) => r.plan),
      );
      setRows(nextRows);
      onChangedRef.current?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
      void refresh();
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const editingRow = editingKey ? rows.find((r) => r.key === editingKey) : null;

  const openAdd = () => {
    setFormMode("add");
    setEditingKey(null);
    setFormOpen(true);
  };

  const openEdit = (row: Row) => {
    setFormMode("edit");
    setEditingKey(row.key);
    setFormOpen(true);
  };

  const handleSubmit = async (plan: StudyPlan) => {
    const nextRows =
      formMode === "edit" && editingKey
        ? rows.map((r) => (r.key === editingKey ? { ...r, plan } : r))
        : [...rows, { key: nextKey(), plan }];
    try {
      await persist(nextRows);
      toast.success(formMode === "edit" ? "Plan updated" : "Plan added");
      setFormOpen(false);
      setEditingKey(null);
    } catch {
      // error already surfaced in persist; keep the form open to retry
    }
  };

  const confirmDelete = async () => {
    if (!deleteKey) return;
    try {
      await persist(rows.filter((r) => r.key !== deleteKey));
      toast.success("Plan deleted");
    } catch {
      // surfaced in persist
    } finally {
      setDeleteKey(null);
    }
  };

  return (
    <>
      <AppModal
        open={open}
        type="edit"
        onClose={onClose}
        title={studyTitle ? `Study Plans — ${studyTitle}` : "Study Plans"}
        footer={
          <AppButton
            variant={AppButtonVariant.Add}
            onClick={openAdd}
            disabled={saving}
          >
            Add Plan
          </AppButton>
        }
      >
        <div className="space-y-3">
          {loading && <p className="text-sm text-primary-600">Loading plans...</p>}
          {!loading && rows.length === 0 && (
            <p className="text-sm text-primary-600">
              No study plans yet. Click <em>Add Plan</em> to create one.
            </p>
          )}
          {!loading && rows.length > 0 && (
            <DraggableList
              items={rows}
              getKey={(r) => r.key}
              onReorder={(next) => void persist(next)}
              listClassName="space-y-3"
              itemClassName="rounded-md border border-primary-200 bg-white p-3"
              handleAriaLabel="Drag to reorder plan"
              renderItem={(r, idx) => (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-primary-600">#{idx + 1}</p>
                    <p className="mt-1 text-sm font-medium text-primary-900 break-words">
                      {r.plan.title || "(untitled plan)"}
                    </p>
                    {r.plan.description && (
                      <p className="mt-1 text-xs text-primary-700 break-words">
                        {r.plan.description}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-primary-600">
                      {r.plan.materials.length} materials ·{" "}
                      {r.plan.keyVerses.length} verses ·{" "}
                      {r.plan.discussionQuestions.length} questions
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <AppButton
                      variant={AppButtonVariant.Edit}
                      className="px-2 py-1 text-xs"
                      onClick={() => openEdit(r)}
                    >
                      Edit
                    </AppButton>
                    <AppButton
                      variant={AppButtonVariant.Delete}
                      className="px-2 py-1 text-xs"
                      onClick={() => setDeleteKey(r.key)}
                    >
                      Delete
                    </AppButton>
                  </div>
                </div>
              )}
            />
          )}
          {saving && <p className="text-xs text-primary-600">Saving...</p>}
        </div>
      </AppModal>

      {/* Mounted only while open so each add/edit starts from a clean form and
          can't inherit the previous plan's verses/materials. */}
      {formOpen && (
        <StudyPlanFormModal
          open
          mode={formMode}
          initial={editingRow?.plan}
          studyTitle={studyTitle ?? ""}
          onClose={() => {
            if (!saving) {
              setFormOpen(false);
              setEditingKey(null);
            }
          }}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDeleteModal
        open={!!deleteKey}
        onCancel={() => {
          if (!saving) setDeleteKey(null);
        }}
        onConfirm={confirmDelete}
        confirmLabel={saving ? "Deleting..." : "Delete"}
        disabled={saving}
      />
    </>
  );
}
