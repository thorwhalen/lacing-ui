import { setupWorker } from 'msw/browser';
import { devAnnotations, devTiers } from './dev-seed';
import { makeHandlers } from './handlers';

// Browser uses a seeded handler set so the inspector / tier list have
// something to show on first load. Tests boot their own per-suite handlers
// from src/mocks/server.ts.
export const worker = setupWorker(
  ...makeHandlers({ annotations: devAnnotations, tiers: devTiers }),
);
