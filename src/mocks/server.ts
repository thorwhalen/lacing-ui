import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Used by tests/setup.ts. The browser counterpart (msw/browser) is wired
// in src/main.tsx when running `npm run dev`.
export const server = setupServer(...handlers);
