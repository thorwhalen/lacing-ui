// Commands for tier CRUD. Tiers are pure metadata; annotations carry their
// tier name as a field, so renaming a tier is a server-side cascade (Phase 4).

import { tierSchema } from '@/domain/collections';
import { tiersProvider } from '@/store/factories';
import { defineCommand } from 'command-wrapex';
import { z } from 'zod';

export const createTierCmd = defineCommand({
  id: 'lacing.tiers.create',
  label: 'Create tier',
  category: 'Tiers',
  description: 'Add a new annotation tier (with optional ELAN stereotype).',
  schema: tierSchema,
  execute: async (params) => {
    const created = await tiersProvider.create(params);
    return { success: true, message: `Created tier ${created.name}`, data: created };
  },
});

export const renameTierCmd = defineCommand({
  id: 'lacing.tiers.rename',
  label: 'Rename tier',
  category: 'Tiers',
  description: 'Rename a tier. Renames cascade to all annotations on this tier.',
  schema: z.object({ name: z.string(), newName: z.string() }),
  when: 'selection.kind === "tier"',
  requiresConfirmation: true,
  execute: async ({ name, newName }) => {
    // Lacing has no in-place rename — we delete and re-create at server level.
    // Real cascade would happen server-side once the rename endpoint lands.
    const tier = await tiersProvider.update(name, { name: newName });
    return { success: true, data: tier };
  },
});

export const deleteTierCmd = defineCommand({
  id: 'lacing.tiers.delete',
  label: 'Delete tier',
  category: 'Tiers',
  description: 'Remove a tier. Annotations on this tier remain but are orphaned.',
  schema: z.object({ name: z.string() }),
  when: 'selection.kind === "tier"',
  requiresConfirmation: true,
  execute: async ({ name }) => {
    await tiersProvider.delete(name);
    return { success: true, message: `Deleted tier ${name}` };
  },
});

export const listTiersCmd = defineCommand({
  id: 'lacing.tiers.list',
  label: 'List tiers',
  category: 'Tiers',
  description: 'Reload the tier list from the active backend.',
  execute: async () => {
    const result = await tiersProvider.getList({});
    return { success: true, data: result };
  },
});

export const tierCommands = [createTierCmd, renameTierCmd, deleteTierCmd, listTiersCmd];
