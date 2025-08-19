"use client";

import React from "react";
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
  children?: React.ReactNode; // used for add/edit content
  footer?: React.ReactNode; // custom footer actions (e.g., Submit)
};

export default function AppModal({ open, type, title, onClose, onDelete, confirmLabel, cancelLabel = "Cancel", children, footer }: Props) {
  if (!open) return null;

  const isDelete = type === "delete";
  const computedTitle = title ?? (isDelete ? "Confirm Delete" : type === "add" ? "Add" : "Edit");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-md border border-primary-200 bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
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
        <div className="mb-4">
          {isDelete ? (
            <p className="text-sm text-primary-800">Are you sure you want to delete this?</p>
          ) : (
            children
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-primary-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-md border border-primary-300 bg-white px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
          >
            {cancelLabel}
          </button>
          {isDelete && !footer && (
            <AppButton variant={AppButtonVariant.Delete} onClick={onDelete}>
              {confirmLabel ?? "Delete"}
            </AppButton>
          )}
          {!isDelete && footer}
        </div>
      </div>
    </div>
  );
}
