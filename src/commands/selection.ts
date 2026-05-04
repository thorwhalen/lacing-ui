// Selection commands — single-pick, clear, and a multi-select toggle stub.

import { useUiStore } from '@/stores/ui';
import { defineCommand } from 'command-wrapex';
import { z } from 'zod';

export const selectAnnotationCmd = defineCommand({
  id: 'lacing.selection.annotation',
  label: 'Select annotation',
  category: 'Selection',
  schema: z.object({ id: z.string().uuid() }),
  execute: async ({ id }) => {
    useUiStore.getState().setSelection({ kind: 'annotation', id });
    return { success: true };
  },
});

export const selectTierCmd = defineCommand({
  id: 'lacing.selection.tier',
  label: 'Select tier',
  category: 'Selection',
  schema: z.object({ name: z.string() }),
  execute: async ({ name }) => {
    useUiStore.getState().setSelection({ kind: 'tier', name });
    return { success: true };
  },
});

export const clearSelectionCmd = defineCommand({
  id: 'lacing.selection.clear',
  label: 'Clear selection',
  category: 'Selection',
  keybinding: { key: 'Escape' },
  execute: async () => {
    useUiStore.getState().setSelection({ kind: 'none' });
    return { success: true };
  },
});

export const selectionCommands = [selectAnnotationCmd, selectTierCmd, clearSelectionCmd];
