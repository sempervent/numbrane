/**
 * Studio session preferences + exploration history (localStorage, corrupt-safe).
 */

import type { StudioMode } from "./keyboard/registry";

const KEY = "numbrane.studio.v1";

export type FavoriteEntry = {
  pieceId: string;
  seed: number;
  label?: string;
  recipe?: Record<string, unknown>;
  savedAt: number;
};

export type HistoryEntry = {
  pieceId: string;
  seed: number;
  mode: StudioMode;
  frame?: number;
  recipe?: Record<string, unknown>;
  at: number;
};

export type StudioPrefs = {
  mode: StudioMode;
  pieceId: string;
  seed: number;
  quality: string;
  controlsVisible: boolean;
  favorites: FavoriteEntry[];
  recent: HistoryEntry[];
  lastSetId: string;
};

const DEFAULTS: StudioPrefs = {
  mode: "generate",
  pieceId: "geometry/metatron",
  seed: 42,
  quality: "high",
  controlsVisible: true,
  favorites: [],
  recent: [],
  lastSetId: "pfl-default",
};

export function loadPrefs(): StudioPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, favorites: [], recent: [] };
    const parsed = JSON.parse(raw) as Partial<StudioPrefs>;
    return {
      ...DEFAULTS,
      ...parsed,
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
    };
  } catch {
    return { ...DEFAULTS, favorites: [], recent: [] };
  }
}

export function savePrefs(prefs: StudioPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* quota / private mode */
  }
}

export class ExploreHistory {
  private stack: HistoryEntry[] = [];
  private index = -1;

  constructor(initial: HistoryEntry[] = []) {
    this.stack = initial.slice(-40);
    this.index = this.stack.length - 1;
  }

  push(entry: HistoryEntry): void {
    if (this.index < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.index + 1);
    }
    this.stack.push(entry);
    if (this.stack.length > 40) this.stack.shift();
    this.index = this.stack.length - 1;
  }

  back(): HistoryEntry | null {
    if (this.index <= 0) return null;
    this.index -= 1;
    return this.stack[this.index] ?? null;
  }

  forward(): HistoryEntry | null {
    if (this.index >= this.stack.length - 1) return null;
    this.index += 1;
    return this.stack[this.index] ?? null;
  }

  current(): HistoryEntry | null {
    return this.stack[this.index] ?? null;
  }

  snapshot(): HistoryEntry[] {
    return [...this.stack];
  }
}
