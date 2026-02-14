import { create } from "zustand";
import { invoke } from "../lib/ipc";

export interface ServiceInfo {
  port: number;
  pid: number;
  process: string;
  protocol: string;
}

interface ServicesState {
  services: ServiceInfo[];
  loading: boolean;

  refresh: () => Promise<void>;
  stopService: (pid: number) => Promise<void>;
}

export const useServicesStore = create<ServicesState>((set, get) => ({
  services: [],
  loading: false,

  refresh: async () => {
    set({ loading: true });
    try {
      const services = await invoke<ServiceInfo[]>("scan_ports");
      set({ services });
    } catch {
      set({ services: [] });
    } finally {
      set({ loading: false });
    }
  },

  stopService: async (pid) => {
    try {
      await invoke("kill_process", { pid });
    } catch { /* ignore */ }
    // Refresh after a short delay
    setTimeout(() => get().refresh(), 500);
  },
}));
