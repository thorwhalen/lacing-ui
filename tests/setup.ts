import '@testing-library/jest-dom/vitest';
import { server } from '@/mocks/server';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

// jsdom doesn't implement HTMLMediaElement.play / .pause — stub them so
// components like ProgramMonitor that drive the <audio> element don't throw.
HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
HTMLMediaElement.prototype.pause = vi.fn();

// jsdom doesn't implement window.matchMedia. Theme store reads
// prefers-color-scheme on init; without this stub it throws.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  })),
});

// jsdom returns 0 for layout properties so @tanstack/react-virtual decides
// nothing is in view and renders no rows. Give every element a sensible
// rect; @tanstack/virtual-core reads offsetWidth/offsetHeight (not
// clientWidth/Height) when measuring the scroll container.
for (const prop of ['clientHeight', 'clientWidth', 'offsetHeight', 'offsetWidth'] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, {
    configurable: true,
    get() {
      return prop.endsWith('Height') ? 800 : 1200;
    },
  });
}

// wavesurfer.js v7 imports AudioContext at module load — that crashes in
// jsdom. Mock both the main module and the regions plugin globally; tests
// that need to assert wavesurfer wiring (Phase 3.5 transport.test.tsx)
// override the regions mock with a richer fake locally.
vi.mock('wavesurfer.js', () => ({
  default: {
    create: () => ({
      destroy: () => undefined,
      registerPlugin: <T>(plugin: T) => plugin,
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
