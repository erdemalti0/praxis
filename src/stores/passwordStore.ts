import { create } from "zustand";
import { invoke } from "../lib/ipc";

export interface CredentialMeta {
  id: string;
  url: string;
  domain: string;
  username: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
}

interface SavePromptState {
  isOpen: boolean;
  url: string;
  domain: string;
  username: string;
  password: string;
}

interface PasswordState {
  credentials: CredentialMeta[];
  credentialsLoaded: boolean;
  savePrompt: SavePromptState | null;
  autofillPrompt: {
    isOpen: boolean;
    url: string;
    domain: string;
    credentials: CredentialMeta[];
  } | null;

  loadCredentials: () => Promise<void>;
  saveCredential: (url: string, username: string, password: string) => Promise<CredentialMeta | null>;
  deleteCredential: (id: string) => Promise<boolean>;
  updateCredential: (id: string, username?: string, password?: string) => Promise<boolean>;
  getPassword: (id: string) => Promise<string | null>;
  getCredentialsForUrl: (url: string) => Promise<CredentialMeta[]>;
  hasCredentialsForUrl: (url: string) => Promise<boolean>;

  showSavePrompt: (url: string, username: string, password: string) => void;
  hideSavePrompt: () => void;
  confirmSavePrompt: () => Promise<void>;
  declineSavePrompt: () => void;

  showAutofillPrompt: (url: string) => Promise<void>;
  hideAutofillPrompt: () => void;
  selectAutofillCredential: (credential: CredentialMeta) => Promise<{ username: string; password: string } | null>;
}

export const usePasswordStore = create<PasswordState>((set, get) => ({
  credentials: [],
  credentialsLoaded: false,
  savePrompt: null,
  autofillPrompt: null,

  loadCredentials: async () => {
    try {
      const creds = await invoke<CredentialMeta[]>("get_credentials");
      set({ credentials: creds, credentialsLoaded: true });
    } catch (err) {
      console.error("Failed to load credentials:", err);
      set({ credentials: [], credentialsLoaded: true });
    }
  },

  saveCredential: async (url, username, password) => {
    try {
      const meta = await invoke<CredentialMeta>("save_credential", { url, username, password });
      await get().loadCredentials();
      return meta;
    } catch (err) {
      console.error("Failed to save credential:", err);
      return null;
    }
  },

  deleteCredential: async (id) => {
    try {
      const success = await invoke<boolean>("delete_credential", { id });
      if (success) {
        set((s) => ({
          credentials: s.credentials.filter((c) => c.id !== id),
        }));
      }
      return success;
    } catch (err) {
      console.error("Failed to delete credential:", err);
      return false;
    }
  },

  updateCredential: async (id, username, password) => {
    try {
      const success = await invoke<boolean>("update_credential", { id, username, password });
      if (success) {
        await get().loadCredentials();
      }
      return success;
    } catch (err) {
      console.error("Failed to update credential:", err);
      return false;
    }
  },

  getPassword: async (id) => {
    try {
      return await invoke<string | null>("get_credential_password", { id });
    } catch (err) {
      console.error("Failed to get password:", err);
      return null;
    }
  },

  getCredentialsForUrl: async (url) => {
    try {
      return await invoke<CredentialMeta[]>("get_credentials_for_url", { url });
    } catch (err) {
      console.error("Failed to get credentials for URL:", err);
      return [];
    }
  },

  hasCredentialsForUrl: async (url) => {
    try {
      return await invoke<boolean>("has_credentials_for_url", { url });
    } catch (err) {
      console.error("Failed to check credentials:", err);
      return false;
    }
  },

  showSavePrompt: (url, username, password) => {
    try {
      const domain = new URL(url).hostname;
      set({
        savePrompt: {
          isOpen: true,
          url,
          domain,
          username,
          password,
        },
      });
    } catch {
      set({
        savePrompt: {
          isOpen: true,
          url,
          domain: url,
          username,
          password,
        },
      });
    }
  },

  hideSavePrompt: () => {
    set({ savePrompt: null });
  },

  confirmSavePrompt: async () => {
    const prompt = get().savePrompt;
    if (!prompt) return;

    await get().saveCredential(prompt.url, prompt.username, prompt.password);
    set({ savePrompt: null });
  },

  declineSavePrompt: () => {
    set({ savePrompt: null });
  },

  showAutofillPrompt: async (url) => {
    try {
      const domain = new URL(url).hostname;
      const creds = await get().getCredentialsForUrl(url);

      if (creds.length === 0) return;

      set({
        autofillPrompt: {
          isOpen: true,
          url,
          domain,
          credentials: creds,
        },
      });
    } catch {
      // Invalid URL, ignore
    }
  },

  hideAutofillPrompt: () => {
    set({ autofillPrompt: null });
  },

  selectAutofillCredential: async (credential) => {
    const password = await get().getPassword(credential.id);
    if (!password) return null;

    set({ autofillPrompt: null });
    return {
      username: credential.username,
      password,
    };
  },
}));
