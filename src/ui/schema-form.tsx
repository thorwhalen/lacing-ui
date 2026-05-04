// SchemaForm — generic form renderer.
//
// Given a FormFieldConfig[] (from toFormConfig) + a CollectionDefinition (so we
// can look up the per-field affordance for the renderer registry's `resolve`)
// and the current values, render one field per config using the shadcn
// renderer registry. Edits flow up through `onChange`.

import type { CollectionDefinition, ResolvedFieldAffordance } from '@zodal/core';
import { toFormConfig } from '@zodal/ui';
import type { FormFieldConfig } from '@zodal/ui';
import { createShadcnRegistry } from '@zodal/ui-shadcn';
import type { z } from 'zod';

const registry = createShadcnRegistry();

interface SchemaFormProps<TSchema extends z.ZodObject<z.ZodRawShape>> {
  collection: CollectionDefinition<TSchema>;
  values: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
  /** Only render these fields (in this order). Default: every visible field. */
  fields?: string[];
  /** 'create' or 'edit' — affects which fields toFormConfig surfaces. */
  mode?: 'create' | 'edit';
}

export function SchemaForm<TSchema extends z.ZodObject<z.ZodRawShape>>({
  collection,
  values,
  onChange,
  fields,
  mode = 'edit',
}: SchemaFormProps<TSchema>) {
  // Get the headless config + filter to the requested fields, in order.
  const all = toFormConfigSafe(collection, mode);
  const configs: FormFieldConfig[] = fields
    ? (fields.map((name) => all.find((c) => c.name === name)).filter(Boolean) as FormFieldConfig[])
    : all;

  return (
    <div className="flex flex-col gap-3">
      {configs.map((config) => {
        const affordance = collection.fieldAffordances[config.name];
        if (!affordance) return null;
        // The runtime affordance carries `zodDef` even though the declared
        // type from `fieldAffordances` doesn't include it. The registry needs
        // a ResolvedFieldAffordance — same object at runtime.
        const Renderer = registry.resolve(affordance as ResolvedFieldAffordance, { mode: 'form' });
        if (!Renderer) {
          return (
            <FallbackField
              key={config.name}
              config={config}
              value={values[config.name]}
              onChange={(v) => onChange(config.name, v)}
            />
          );
        }
        return (
          <div key={config.name} className="flex flex-col gap-1">
            <label htmlFor={config.name} className="text-xs font-medium">
              {config.label}
              {config.required && <span className="text-destructive">*</span>}
            </label>
            <Renderer
              config={config}
              field={{
                value: values[config.name],
                onChange: (v: unknown) => onChange(config.name, v),
              }}
            />
            {config.helpText && <p className="text-xs text-muted-foreground">{config.helpText}</p>}
          </div>
        );
      })}
    </div>
  );
}

// Some Zod types may not have a registered renderer — fall back to a JSON
// textarea so the user always has something to edit.
interface FallbackProps {
  config: FormFieldConfig;
  value: unknown;
  onChange: (v: unknown) => void;
}

function FallbackField({ config, value, onChange }: FallbackProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={config.name} className="text-xs font-medium">
        {config.label}
        <span className="text-muted-foreground"> (json)</span>
      </label>
      <textarea
        id={config.name}
        rows={4}
        className="rounded-md border px-2 py-1 text-xs font-mono bg-background"
        value={JSON.stringify(value ?? null, null, 2)}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            // Keep last good value; show nothing — the form save validates.
          }
        }}
      />
    </div>
  );
}

function toFormConfigSafe<TSchema extends z.ZodObject<z.ZodRawShape>>(
  collection: CollectionDefinition<TSchema>,
  mode: 'create' | 'edit',
): FormFieldConfig[] {
  return toFormConfig(collection, mode);
}
