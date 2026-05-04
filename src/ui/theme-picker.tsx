// 3-state theme picker: light / dark / system.
// Uses native <select> for accessibility — keyboard, screen readers, and
// touch all "just work" without a Radix Popover.

import { cn } from '@/lib/utils';
import { type Theme, useThemeStore } from '@/stores/theme';

export function ThemePicker({ className }: { className?: string }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <label className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}>
      <span>Theme</span>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
        className="rounded-md border bg-background px-2 py-1 text-xs"
        aria-label="Color theme"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
