// Single command registry per app instance.
//
// Default middleware = error boundary + logging + validation. Telemetry will
// be a separate middleware once OpenTelemetry is wired (Phase 5).
//
// `evaluateWhen` reads boolean flags out of a tiny app-context object that the
// `contextProvider` rebuilds on every execute() — so when-clauses always see
// fresh state.

import { useUiStore } from '@/stores/ui';
import { createDefaultMiddleware, createRegistry } from 'command-wrapex';
import type { CommandContext, CommandRegistry, WhenClauseEvaluator } from 'command-wrapex';

interface AppWhenContext {
  selection: 'none' | 'annotation' | 'tier';
  hasAnnotations: boolean;
}

function buildWhenContext(): AppWhenContext {
  const ui = useUiStore.getState();
  return {
    selection: ui.selection.kind,
    hasAnnotations: ui.lastListSize > 0,
  };
}

const evaluateWhen: WhenClauseEvaluator = (clause: string) => {
  // Tiny when-clause evaluator: boolean flag names + "selection==='annotation'"
  // style equality. No JS eval — just a switch on known clauses.
  const ctx = buildWhenContext();
  switch (clause) {
    case 'hasAnnotations':
      return ctx.hasAnnotations;
    case 'selection.kind === "annotation"':
      return ctx.selection === 'annotation';
    case 'selection.kind === "tier"':
      return ctx.selection === 'tier';
    case 'selection.kind !== "none"':
      return ctx.selection !== 'none';
    default:
      // Unknown clauses default to TRUE so commands aren't accidentally hidden
      // — surface a console warning so we catch typos in dev.
      console.warn(`[wrapex] unknown when-clause: ${clause}`);
      return true;
  }
};

const contextProvider = (): Partial<CommandContext> => ({
  ui: useUiStore.getState(),
});

export const registry: CommandRegistry = createRegistry({
  middleware: createDefaultMiddleware(),
  evaluateWhen,
  contextProvider,
});
