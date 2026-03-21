import { watch } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Watch ~/.claude/projects/ for JSONL file changes.
 * Calls onChange() when new data is detected, debounced.
 */
export function createWatcher(onChange, baseDir) {
  const projectsDir = baseDir || join(homedir(), '.claude', 'projects');
  let debounceTimer = null;
  const DEBOUNCE_MS = 2000; // wait 2s after last change before triggering

  const watcher = watch(projectsDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    // Only care about JSONL files
    if (!filename.endsWith('.jsonl')) return;

    // Debounce: reset timer on each change
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      onChange();
    }, DEBOUNCE_MS);
  });

  watcher.on('error', (err) => {
    // On macOS, recursive watch can fail on some dirs — just log and continue
    console.error('Watcher error:', err.message);
  });

  return {
    close() {
      if (debounceTimer) clearTimeout(debounceTimer);
      watcher.close();
    }
  };
}
