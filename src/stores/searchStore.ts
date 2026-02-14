import { create } from "zustand";
import { invoke } from "../lib/ipc";

export interface SearchResult {
  file: string;
  line: number;
  content: string;
}

interface SearchState {
  query: string;
  isRegex: boolean;
  caseSensitive: boolean;
  results: SearchResult[];
  loading: boolean;

  setQuery: (q: string) => void;
  setIsRegex: (v: boolean) => void;
  setCaseSensitive: (v: boolean) => void;
  search: (projectPath: string) => Promise<void>;
  clearResults: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: "",
  isRegex: false,
  caseSensitive: false,
  results: [],
  loading: false,

  setQuery: (query) => set({ query }),
  setIsRegex: (isRegex) => set({ isRegex }),
  setCaseSensitive: (caseSensitive) => set({ caseSensitive }),

  search: async (projectPath) => {
    const { query, isRegex, caseSensitive } = get();
    if (!query.trim() || !projectPath) return;
    set({ loading: true });
    try {
      const results = await invoke<SearchResult[]>("search_files", {
        projectPath, query, isRegex, caseSensitive,
      });
      set({ results });
    } catch {
      set({ results: [] });
    } finally {
      set({ loading: false });
    }
  },

  clearResults: () => set({ results: [], query: "" }),
}));
