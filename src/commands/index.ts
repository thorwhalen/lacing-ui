// Register every command into the shared registry. App.tsx imports this
// module once at startup.

import { annotationCommands } from './annotations';
import { ioCommands } from './io';
import { registry } from './registry';
import { selectionCommands } from './selection';
import { tierCommands } from './tiers';
import { timelineCommands } from './timeline';
import { transportCommands } from './transport';

let registered = false;

export function registerAllCommands(): void {
  if (registered) return;
  registry.registerAll([
    ...annotationCommands,
    ...tierCommands,
    ...transportCommands,
    ...selectionCommands,
    ...timelineCommands,
    ...ioCommands,
  ]);
  registered = true;
}

export { registry } from './registry';
