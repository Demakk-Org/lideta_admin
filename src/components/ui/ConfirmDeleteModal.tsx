"use client";

import AppModal from "./AppModal";

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  disabled?: boolean;
};

export default function ConfirmDeleteModal({ open, onCancel, onConfirm, title, confirmLabel = "Delete", cancelLabel = "Cancel", disabled }: Props) {
  return (
    <AppModal
      open={open}
      type="delete"
      onClose={onCancel}
      onDelete={onConfirm}
      title={title}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      confirmDisabled={disabled}
    />
  );
}
