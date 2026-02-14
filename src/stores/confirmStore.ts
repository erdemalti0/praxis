import { create } from "zustand";

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  danger: boolean;
  onConfirm: (() => void) | null;
  showConfirm: (title: string, message: string, onConfirm: () => void, options?: { danger?: boolean }) => void;
  hideConfirm: () => void;
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  isOpen: false,
  title: "",
  message: "",
  danger: false,
  onConfirm: null,
  showConfirm: (title, message, onConfirm, options) =>
    set({ isOpen: true, title, message, onConfirm, danger: options?.danger ?? false }),
  hideConfirm: () => set({ isOpen: false, onConfirm: null }),
}));
