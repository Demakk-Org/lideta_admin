"use client";

import React, { useEffect } from "react";
import AppButton, { AppButtonVariant } from "./AppButton";

export type AppModalType = "add" | "edit" | "delete";

type Props = {
  open: boolean;
  type: AppModalType;
  title?: string;
  onClose: () => void;
  onDelete?: () => void; // confirm delete action
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  children?: React.ReactNode; // used for add/edit content
  footer?: React.ReactNode; // custom footer actions (e.g., Submit)
};

// Global (module-scoped) reference-counted body scroll lock
let __scrollLockCount = 0;
function lockBodyScroll() {
  if (typeof document === "undefined") return;
  if (__scrollLockCount === 0) {
    document.body.style.overflow = "hidden";
  }
  __scrollLockCount += 1;
}
function unlockBodyScroll() {
  if (typeof document === "undefined") return;
  __scrollLockCount = Math.max(0, __scrollLockCount - 1);
  if (__scrollLockCount === 0) {
    // Always reset to default to avoid lingering 'hidden' from prior errors/HMR
    document.body.style.overflow = "";
  }
}

export default function AppModal({ open, type, title, onClose, onDelete, confirmLabel, cancelLabel = "Cancel", confirmDisabled, children, footer }: Props) {
  const isDelete = type === "delete";
  const computedTitle = title ?? (isDelete ? "Confirm Delete" : type === "add" ? "Add" : "Edit");

  // Lock body scroll while modal is open (reference-counted for multiple modals)
  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-md border border-primary-200 bg-white p-4 shadow-xl max-h-[85vh] flex flex-col">
        <div className="mb-3 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-primary-800">{computedTitle}</h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-primary-700 hover:bg-primary-50"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="mb-4 flex-1 overflow-y-auto">
          {isDelete ? (
            <p className="text-sm text-primary-800">Are you sure you want to delete this?</p>
          ) : (
            children
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-primary-200 pt-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-md border border-primary-300 bg-white px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
          >
            {cancelLabel}
          </button>
          {isDelete && !footer && (
            <AppButton variant={AppButtonVariant.Delete} onClick={onDelete} disabled={confirmDisabled}>
              {confirmLabel ?? "Delete"}
            </AppButton>
          )}
          {!isDelete && footer}
        </div>
      </div>
    </div>
  );
}

