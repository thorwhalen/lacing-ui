// I/O commands — import / export via the lacing FastAPI adapter endpoints,
// plus a "switch backend" toggle for the dev-mode picker.

import { defineCommand } from 'command-wrapex';
import { z } from 'zod';

const adapterFormat = z.enum([
  'annot',
  'eaf',
  'jams',
  'label-studio',
  'otio',
  'textgrid',
  'web-annotation',
  'webvtt',
]);

export const importFromFormatCmd = defineCommand({
  id: 'lacing.io.import',
  label: 'Import file',
  category: 'I/O',
  description: 'Upload an annotation file via the lacing /import?format=… endpoint.',
  schema: z.object({
    format: adapterFormat,
    content: z.string(),
  }),
  execute: async ({ format, content }) => {
    const response = await fetch(`/api/import?format=${encodeURIComponent(format)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: content,
    });
    if (!response.ok) {
      throw new Error(`import failed: ${response.status}`);
    }
    return { success: true, data: await response.json() };
  },
});

export const exportToFormatCmd = defineCommand({
  id: 'lacing.io.export',
  label: 'Export to format',
  category: 'I/O',
  description: 'Dump the active project via /export?format=…',
  schema: z.object({ format: adapterFormat }),
  execute: async ({ format }) => {
    const response = await fetch(`/api/export?format=${encodeURIComponent(format)}`);
    if (!response.ok) {
      throw new Error(`export failed: ${response.status}`);
    }
    const blob = await response.blob();
    return { success: true, data: { size: blob.size } };
  },
});

export const ioCommands = [importFromFormatCmd, exportToFormatCmd];
