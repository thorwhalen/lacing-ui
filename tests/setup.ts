import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { server } from '@/mocks/server';

// jsdom doesn't implement HTMLMediaElement.play / .pause — stub them so
// components like ProgramMonitor that drive the <audio> element don't throw.
HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
HTMLMediaElement.prototype.pause = vi.fn();

// wavesurfer.js v7 imports AudioContext at module load — that crashes in
// jsdom. Mock both the main module and the regions plugin globally; tests
// that need to assert wavesurfer wiring (Phase 3.5 transport.test.tsx)
// override the regions mock with a richer fake locally.
vi.mock('wavesurfer.js', () => ({
  default: {
    create: () => ({
      destroy: () => undefined,
      registerPlugin: <T,>(plugin: T) => plugin,
    }),
  },
}));
vi.mock('wavesurfer.js/dist/plugins/regions.esm.js', () => ({
  default: {
    create: () => ({
      addRegion: () => undefined,
      clearRegions: () => undefined,
      on: () => undefined,
    }),
  },
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
