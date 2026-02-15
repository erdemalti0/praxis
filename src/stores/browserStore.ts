import { create } from "zustand";
import { invoke } from "../lib/ipc";
import { loadJsonFile } from "../lib/persistence";

export interface Favorite {
  id: string;
  name: string;
  url: string;
  icon?: string;
}

export interface BrowserTabError {
  type: "network" | "404" | "timeout" | "dns" | "ssl" | "unknown";
  url: string;
  message: string;
}

export interface BrowserTab {
  id: string;
  url: string | null;
  label: string;
  showLanding: boolean;
  favicon?: string;
  title?: string;
  isLoading?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  groupId?: string;
  error?: BrowserTabError;
}

export interface TabGroup {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
}

export interface ClosedTab {
  id: string;
  url: string;
  label: string;
  favicon?: string;
  closedAt: number;
}

interface BrowserState {
  tabs: BrowserTab[];
  activeBrowserTabId: string | null;
  favorites: Favorite[];
  favoritesLoaded: boolean;
  browserMaximized: boolean;
  tabGroups: TabGroup[];
  closedTabs: ClosedTab[];

  createLandingTab: () => void;
  removeTab: (id: string) => void;
  setActiveBrowserTabId: (id: string | null) => void;
  navigateTab: (tabId: string, url: string) => void;
  showTabLanding: (tabId: string) => void;
  setBrowserMaximized: (maximized: boolean) => void;
  
  updateTab: (tabId: string, updates: Partial<BrowserTab>) => void;
  setTabLoading: (tabId: string, isLoading: boolean) => void;
  setTabFavicon: (tabId: string, favicon: string | undefined) => void;
  setTabTitle: (tabId: string, title: string) => void;
  setTabNavigationState: (tabId: string, canGoBack: boolean, canGoForward: boolean) => void;
  pinTab: (tabId: string) => void;
  unpinTab: (tabId: string) => void;
  muteTab: (tabId: string) => void;
  unmuteTab: (tabId: string) => void;
  duplicateTab: (tabId: string) => void;
  reopenClosedTab: () => void;
  closeOtherTabs: (tabId: string) => void;
  closeTabsToRight: (tabId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  
  createTabGroup: (name: string, color: string) => string;
  addTabToGroup: (tabId: string, groupId: string) => void;
  removeTabFromGroup: (tabId: string) => void;
  toggleGroupCollapsed: (groupId: string) => void;
  deleteTabGroup: (groupId: string) => void;

  loadFavorites: () => Promise<void>;
  addFavorite: (name: string, url: string, icon?: string) => Promise<void>;
  removeFavorite: (id: string) => Promise<void>;
  loadBrowserState: (homeDir: string) => void;
  _browserLoaded: boolean;
}

const DEFAULT_FAVORITES: Favorite[] = [
  { id: "default-1", name: "Google", url: "https://www.google.com" },
  { id: "default-2", name: "GitHub", url: "https://github.com" },
  { id: "default-3", name: "YouTube", url: "https://youtube.com" },
  { id: "default-4", name: "Claude", url: "https://claude.ai" },
  { id: "default-5", name: "ChatGPT", url: "https://chat.openai.com" },
  { id: "default-6", name: "Bridgemind", url: "https://www.bridgemind.ai/" },
  { id: "default-7", name: "Perplexity", url: "https://www.perplexity.ai/" },
];

function extractHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return rawUrl;
  }
}

function getFaviconUrl(siteUrl: string): string {
  try {
    const domain = new URL(siteUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return "";
  }
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [],
  activeBrowserTabId: null,
  favorites: [],
  favoritesLoaded: false,
  browserMaximized: false,
  tabGroups: [],
  closedTabs: [],
  _browserLoaded: false,

  createLandingTab: () => {
    const tabId = `browser-${Date.now()}`;
    set((s) => ({
      tabs: [
        ...s.tabs,
        {
          id: tabId,
          url: null,
          label: "New Tab",
          showLanding: true,
          isLoading: false,
          canGoBack: false,
          canGoForward: false,
          isPinned: false,
          isMuted: false,
        },
      ],
      activeBrowserTabId: tabId,
    }));
  },

  removeTab: (id) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === id);
      let newClosedTabs = s.closedTabs;
      
      if (tab && tab.url && !tab.isPinned) {
        newClosedTabs = [
          {
            id: tab.id,
            url: tab.url!,
            label: tab.label,
            favicon: tab.favicon,
            closedAt: Date.now(),
          },
          ...s.closedTabs.slice(0, 19),
        ];
      }
      
      const newTabs = s.tabs.filter((t) => t.id !== id);
      const remainingTabs = newTabs.filter((t) => !t.isPinned);
      const pinnedTabs = newTabs.filter((t) => t.isPinned);
      
      let newActiveId = s.activeBrowserTabId;
      if (s.activeBrowserTabId === id) {
        const allRemaining = [...pinnedTabs, ...remainingTabs];
        if (allRemaining.length > 0) {
          const closedIndex = s.tabs.findIndex((t) => t.id === id);
          if (closedIndex > 0 && closedIndex < allRemaining.length) {
            newActiveId = allRemaining[closedIndex - 1]?.id ?? allRemaining[0].id;
          } else {
            newActiveId = allRemaining[0].id;
          }
        } else {
          newActiveId = null;
        }
      }
      
      return {
        tabs: newTabs,
        activeBrowserTabId: newActiveId,
        closedTabs: newClosedTabs,
      };
    }),

  setActiveBrowserTabId: (id) => set({ activeBrowserTabId: id }),

  navigateTab: (tabId, url) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              url,
              label: extractHostname(url),
              showLanding: false,
              favicon: getFaviconUrl(url),
              isLoading: true,
            }
          : t
      ),
    })),

  showTabLanding: (tabId) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, showLanding: true } : t
      ),
    })),

  setBrowserMaximized: (maximized) => set({ browserMaximized: maximized }),

  updateTab: (tabId, updates) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, ...updates } : t
      ),
    })),

  setTabLoading: (tabId, isLoading) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, isLoading } : t
      ),
    })),

  setTabFavicon: (tabId, favicon) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, favicon } : t
      ),
    })),

  setTabTitle: (tabId, title) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, title, label: title || t.label } : t
      ),
    })),

  setTabNavigationState: (tabId, canGoBack, canGoForward) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, canGoBack, canGoForward } : t
      ),
    })),

  pinTab: (tabId) =>
    set((s) => {
      const tabs = [...s.tabs];
      const tabIndex = tabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return s;
      
      tabs[tabIndex] = { ...tabs[tabIndex], isPinned: true };
      const pinnedTabs = tabs.filter((t) => t.isPinned);
      const unpinnedTabs = tabs.filter((t) => !t.isPinned);
      
      return { tabs: [...pinnedTabs, ...unpinnedTabs] };
    }),

  unpinTab: (tabId) =>
    set((s) => {
      const tabs = [...s.tabs];
      const tabIndex = tabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return s;
      
      tabs[tabIndex] = { ...tabs[tabIndex], isPinned: false };
      const pinnedTabs = tabs.filter((t) => t.isPinned);
      const unpinnedTabs = tabs.filter((t) => !t.isPinned);
      
      return { tabs: [...pinnedTabs, ...unpinnedTabs] };
    }),

  muteTab: (tabId) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, isMuted: true } : t
      ),
    })),

  unmuteTab: (tabId) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, isMuted: false } : t
      ),
    })),

  duplicateTab: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    
    const newTabId = `browser-${Date.now()}`;
    const newTab: BrowserTab = {
      ...tab,
      id: newTabId,
      isPinned: false,
      isLoading: tab.url ? true : false,
    };
    
    set((s) => {
      const tabIndex = s.tabs.findIndex((t) => t.id === tabId);
      const newTabs = [...s.tabs];
      newTabs.splice(tabIndex + 1, 0, newTab);
      
      return {
        tabs: newTabs,
        activeBrowserTabId: newTabId,
      };
    });
  },

  reopenClosedTab: () => {
    const closedTabs = get().closedTabs;
    if (closedTabs.length === 0) return;
    
    const [lastClosed, ...remaining] = closedTabs;
    const newTabId = `browser-${Date.now()}`;
    
    const newTab: BrowserTab = {
      id: newTabId,
      url: lastClosed.url,
      label: lastClosed.label,
      favicon: lastClosed.favicon,
      showLanding: false,
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      isPinned: false,
      isMuted: false,
    };
    
    set((s) => ({
      tabs: [...s.tabs, newTab],
      activeBrowserTabId: newTabId,
      closedTabs: remaining,
    }));
  },

  closeOtherTabs: (tabId) =>
    set((s) => ({
      tabs: s.tabs.filter((t) => t.id === tabId || t.isPinned),
    })),

  closeTabsToRight: (tabId) =>
    set((s) => {
      const tabIndex = s.tabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return s;
      
      return {
        tabs: s.tabs.slice(0, tabIndex + 1),
      };
    }),

  reorderTabs: (fromIndex, toIndex) =>
    set((s) => {
      const tabs = [...s.tabs];
      const [removed] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, removed);
      return { tabs };
    }),

  createTabGroup: (name, color) => {
    const groupId = `group-${Date.now()}`;
    set((s) => ({
      tabGroups: [...s.tabGroups, { id: groupId, name, color, collapsed: false }],
    }));
    return groupId;
  },

  addTabToGroup: (tabId, groupId) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, groupId } : t
      ),
    })),

  removeTabFromGroup: (tabId) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, groupId: undefined } : t
      ),
    })),

  toggleGroupCollapsed: (groupId) =>
    set((s) => ({
      tabGroups: s.tabGroups.map((g) =>
        g.id === groupId ? { ...g, collapsed: !g.collapsed } : g
      ),
    })),

  deleteTabGroup: (groupId) =>
    set((s) => ({
      tabGroups: s.tabGroups.filter((g) => g.id !== groupId),
      tabs: s.tabs.map((t) =>
        t.groupId === groupId ? { ...t, groupId: undefined } : t
      ),
    })),

  loadFavorites: async () => {
    try {
      const favs = await invoke<Favorite[]>("load_favorites");
      if (favs.length === 0) {
        await invoke("save_favorites", { favorites: DEFAULT_FAVORITES });
        set({ favorites: DEFAULT_FAVORITES, favoritesLoaded: true });
      } else {
        set({ favorites: favs, favoritesLoaded: true });
      }
    } catch {
      set({ favorites: DEFAULT_FAVORITES, favoritesLoaded: true });
    }
  },

  addFavorite: async (name, url, icon) => {
    const fav: Favorite = {
      id: `fav-${Date.now()}`,
      name,
      url,
      icon,
    };
    const newFavs = [...get().favorites, fav];
    set({ favorites: newFavs });
    try {
      await invoke("save_favorites", { favorites: newFavs });
    } catch (err) {
      console.error("Failed to save favorites:", err);
    }
  },

  removeFavorite: async (id) => {
    const newFavs = get().favorites.filter((f) => f.id !== id);
    set({ favorites: newFavs });
    try {
      await invoke("save_favorites", { favorites: newFavs });
    } catch (err) {
      console.error("Failed to save favorites:", err);
    }
  },

  loadBrowserState: (homeDir) => {
    const path = `${homeDir}/.praxis/browser-state.json`;
    const data = loadJsonFile(path, {
      tabs: [] as any[],
      tabGroups: [] as TabGroup[],
      closedTabs: [] as ClosedTab[],
      activeBrowserTabId: null as string | null,
    });

    // Restore tabs: re-add transient fields, mark as loading for re-navigation
    const tabs: BrowserTab[] = data.tabs
      .filter((t: any) => t.url) // only tabs with URLs
      .map((t: any) => ({
        id: t.id,
        url: t.url,
        label: t.label || extractHostname(t.url),
        showLanding: false,
        favicon: t.favicon,
        title: t.title,
        isLoading: true,
        canGoBack: false,
        canGoForward: false,
        isPinned: t.isPinned || false,
        isMuted: t.isMuted || false,
        groupId: t.groupId,
      }));

    set({
      tabs,
      tabGroups: data.tabGroups,
      closedTabs: data.closedTabs,
      activeBrowserTabId: data.activeBrowserTabId,
      _browserLoaded: true,
    });
  },
}));
