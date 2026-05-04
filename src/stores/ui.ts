// uiStore — ephemeral UI state (selection, palette open, last list size).
// Domain mutations go through the command registry → DataProvider; this store
// only holds throwaway state the UI reads directly.

import { create } from 'zustand';

export type Selection =
  | { kind: 'none' }
  | { kind: 'annotation'; id: string }
  | { kind: 'tier'; name: string };

interface UiState {
  selection: Selection;
  paletteOpen: boolean;
  lastListSize: number;
  setSelection: (s: Selection) => void;
  setPaletteOpen: (open: boolean) => void;
  togglePalette: () => void;
  setLastListSize: (n: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selection: { kind: 'none' },
  paletteOpen: false,
  lastListSize: 0,
  setSelection: (selection) => set({ selection }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setLastListSize: (n) => set({ lastListSize: n }),
}));
