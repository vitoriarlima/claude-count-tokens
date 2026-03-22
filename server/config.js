import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.claude-count-tokens');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

/**
 * Read the local config file. Returns null if not found.
 */
export async function getConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save config to disk. Creates the directory if needed.
 * Shape: { supabaseAccessToken, supabaseRefreshToken, username, userId }
 */
export async function saveConfig(config) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Delete the config file (logout).
 */
export async function clearConfig() {
  try {
    await unlink(CONFIG_PATH);
  } catch {
    // already gone
  }
}

export { CONFIG_DIR };
