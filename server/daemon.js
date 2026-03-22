import { writeFile, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { CONFIG_DIR } from './config.js';

const LABEL = 'com.claude-count-tokens.sync';
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const LOG_PATH = join(CONFIG_DIR, 'sync.log');

/**
 * Install a macOS launchd agent that syncs every hour.
 */
export async function installDaemon() {
  if (process.platform !== 'darwin') {
    console.error('  ✗ Background sync is currently macOS-only (launchd).\n');
    console.log('  On Linux, add a cron job:');
    console.log('  0 * * * * npx claude-count-tokens sync\n');
    process.exit(1);
  }

  // Find the npx path
  const npxPath = findNpx();

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${npxPath}</string>
    <string>claude-count-tokens</string>
    <string>sync</string>
  </array>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>StandardOutPath</key>
  <string>${LOG_PATH}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_PATH}</string>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>`;

  // Unload if already loaded
  try {
    execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null`);
  } catch { /* not loaded */ }

  await writeFile(PLIST_PATH, plist);
  execSync(`launchctl load "${PLIST_PATH}"`);

  console.log(`\n  ✓ Installed background sync (runs every hour)`);
  console.log(`  Plist: ${PLIST_PATH}`);
  console.log(`  Logs:  ${LOG_PATH}`);
  console.log(`\n  To uninstall: npx claude-count-tokens sync --uninstall\n`);
}

/**
 * Uninstall the launchd agent.
 */
export async function uninstallDaemon() {
  try {
    execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null`);
  } catch { /* not loaded */ }

  try {
    await unlink(PLIST_PATH);
    console.log('  ✓ Background sync uninstalled.\n');
  } catch {
    console.log('  Nothing to uninstall — daemon was not installed.\n');
  }
}

/**
 * Check if the daemon is currently loaded.
 */
export async function statusDaemon() {
  const exists = await stat(PLIST_PATH).catch(() => null);
  if (!exists) {
    console.log('  Background sync: not installed\n');
    return;
  }

  try {
    const output = execSync(`launchctl list | grep ${LABEL}`, { encoding: 'utf-8' });
    console.log(`  Background sync: running`);
    console.log(`  ${output.trim()}\n`);
  } catch {
    console.log('  Background sync: installed but not running\n');
  }
}

function findNpx() {
  try {
    return execSync('which npx', { encoding: 'utf-8' }).trim();
  } catch {
    return '/usr/local/bin/npx';
  }
}
