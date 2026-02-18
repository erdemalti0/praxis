import { create } from "zustand";

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  danger: boolean;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: (() => void) | null;
  onCancel: (() => void) | null;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: { danger?: boolean; confirmLabel?: string; cancelLabel?: string; onCancel?: () => void }
  ) => void;
  hideConfirm: () => void;
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  isOpen: false,
  title: "",
  message: "",
  danger: false,
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  onConfirm: null,
  onCancel: null,
  showConfirm: (title, message, onConfirm, options) =>
    set({
      isOpen: true,
      title,
      message,
      onConfirm,
      danger: options?.danger ?? false,
      confirmLabel: options?.confirmLabel ?? "Confirm",
      cancelLabel: options?.cancelLabel ?? "Cancel",
      onCancel: options?.onCancel ?? null,
    }),
  hideConfirm: () => set({ isOpen: false, onConfirm: null, onCancel: null }),
}));
