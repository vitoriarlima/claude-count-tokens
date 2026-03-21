import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Discover all JSONL log files under ~/.claude/projects/
 * Returns array of absolute file paths sorted by mtime (newest first)
 */
export async function discoverLogFiles(baseDir, projectFilter) {
  const projectsDir = baseDir || join(homedir(), '.claude', 'projects');
  const files = [];

  try {
    const projects = await readdir(projectsDir);

    for (const project of projects) {
      if (projectFilter && project !== projectFilter) continue;

      const projectPath = join(projectsDir, project);
      const projectStat = await stat(projectPath).catch(() => null);
      if (!projectStat?.isDirectory()) continue;

      const entries = await readdir(projectPath).catch(() => []);

      for (const entry of entries) {
        const entryPath = join(projectPath, entry);

        // Top-level JSONL files (main conversation logs)
        if (entry.endsWith('.jsonl')) {
          const s = await stat(entryPath).catch(() => null);
          if (s?.isFile()) {
            files.push({ path: entryPath, mtime: s.mtimeMs });
          }
          continue;
        }

        // UUID directories may contain subagents/
        const entryStat = await stat(entryPath).catch(() => null);
        if (!entryStat?.isDirectory()) continue;

        const subagentsDir = join(entryPath, 'subagents');
        const subagentEntries = await readdir(subagentsDir).catch(() => []);

        for (const sub of subagentEntries) {
          if (!sub.endsWith('.jsonl')) continue;
          const subPath = join(subagentsDir, sub);
          const s = await stat(subPath).catch(() => null);
          if (s?.isFile()) {
            files.push({ path: subPath, mtime: s.mtimeMs });
          }
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // ~/.claude/projects/ doesn't exist — return empty
  }

  // Sort newest first
  files.sort((a, b) => b.mtime - a.mtime);
  return files.map(f => f.path);
}
