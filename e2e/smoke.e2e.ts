// Phase 3.7 smoke — load the app, select an annotation, edit a field,
// Save, then export. Runs against the dev MSW backend (npm run dev),
// which seeds two `words` annotations and three tiers via dev-seed.ts.

import { expect, test } from '@playwright/test';

test('the minimum useful editor works end-to-end', async ({ page }) => {
  await page.goto('/');

  // Header is visible.
  await expect(page.getByRole('heading', { name: 'lacing' })).toBeVisible();

  // Tier list shows the seeded tiers (scoped to the tier list aside).
  const tierList = page.getByRole('complementary', { name: 'Tier list' });
  await expect(tierList.getByRole('button', { name: 'words', exact: true })).toBeVisible();
  await expect(tierList.getByRole('button', { name: /phonemes/ })).toBeVisible();

  // Annotation list shows the seeded annotations; click one → Inspector loads.
  const annotationList = page.getByLabel('Annotation list');
  const helloRow = annotationList.getByRole('button', { name: /words.*hello/ });
  await expect(helloRow).toBeVisible();
  await helloRow.click();
  await expect(page.getByRole('heading', { name: 'Inspector' })).toBeVisible();
  await expect(page.getByText('annot://schema/word/v1')).toBeVisible();

  // Edit the tier inside the Inspector. SchemaForm's shadcn cell renderers
  // don't bind labels via htmlFor, so we use the first textbox in the
  // Inspector aside as a stable handle.
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('textbox').first().fill('renamed');

  await expect(inspector.getByRole('button', { name: /^Save$/ })).toBeEnabled();
  await inspector.getByRole('button', { name: /^Save$/ }).click();
  await expect(inspector.getByRole('button', { name: /^Save$/ })).toBeDisabled();

  // Export: triggers a Blob download. The dev MSW backend echoes a JSON payload.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save as/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/lacing-export\./);

  // ⌘K palette opens via the toolbar button + Escape closes it.
  await page.getByRole('button', { name: /⌘K Commands/ }).click();
  await expect(page.getByRole('dialog', { name: /Command palette/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /Command palette/ })).toBeHidden();
});
