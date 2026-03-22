# claude-count-tokens — Live Sync Epic

## Overview

Make the claude-count-tokens widget auto-update with live data by adding cloud sync via Supabase. Users log in once, install a background daemon, and their widget stays current — zero manual re-exports.

**Architecture:**
```
User's Mac                        Supabase                         User's Website
┌──────────────┐                ┌─────────────────┐              ┌──────────────┐
│ ~/.claude/    │               │                  │              │              │
│  projects/    │──CLI sync────▶│  Auth (GitHub)   │◀──fetch──── │ <widget      │
│  (local logs) │  (POST JSON)  │  Storage (JSON)  │              │  user="x" /> │
│               │               │  DB (profiles)   │              │              │
│ launchd ⟳     │               └─────────────────┘              └──────────────┘
└──────────────┘
```

---

## Tickets

### CCT-1: Supabase project setup & migration

**Type:** Infrastructure
**Priority:** P0 — blocks everything else

**Description:**
Set up the Supabase project and create the database schema + storage bucket.

**Acceptance criteria:**
- [ ] Supabase project created
- [ ] GitHub OAuth provider enabled in Supabase Auth settings
- [ ] `profiles` table created: `id (uuid, FK → auth.users)`, `username (text, unique)`, `created_at (timestamptz)`
- [ ] Trigger: auto-create profile row on user signup (pulls GitHub username from `raw_user_meta_data`)
- [ ] Storage bucket `token-data` created with public read access
- [ ] RLS policy: authenticated users can only upload to their own `{username}.json` file
- [ ] Migration SQL committed to `supabase/migration.sql`

**Notes:**
- The Supabase URL and anon key will be hardcoded in the CLI (they're public by design in Supabase)
- No custom backend server needed — CLI talks directly to Supabase REST API

---

### CCT-2: Config module (`server/config.js`)

**Type:** Feature
**Priority:** P0 — blocks auth and sync

**Description:**
Create a config module that manages local credentials stored at `~/.claude-count-tokens/config.json`.

**Acceptance criteria:**
- [ ] `getConfig()` — reads and returns config object, returns `null` if not found
- [ ] `saveConfig(config)` — writes config object to disk, creating directory if needed
- [ ] `clearConfig()` — deletes the config file
- [ ] Config schema: `{ supabaseAccessToken, supabaseRefreshToken, username, userId }`
- [ ] Zero external dependencies (uses Node built-in `fs/promises`)

---

### CCT-3: Auth / login flow (`server/auth.js`)

**Type:** Feature
**Priority:** P0 — blocks sync

**Description:**
Implement `npx claude-count-tokens login` — opens browser for GitHub OAuth via Supabase, receives callback, saves credentials.

**Acceptance criteria:**
- [ ] `login()` function that:
  1. Starts a temporary local HTTP server on a random port
  2. Opens the user's browser to `{SUPABASE_URL}/auth/v1/authorize?provider=github&redirect_to=http://localhost:{port}/callback`
  3. Receives the OAuth callback with access/refresh tokens
  4. Exchanges code for session via Supabase REST API
  5. Fetches user profile (GitHub username) from `auth.getUser()`
  6. Saves tokens + username to config via `saveConfig()`
  7. Shuts down the local server
  8. Prints success message: "Logged in as {username}. Your widget embed: <claude-token-heatmap user='{username}'>"
- [ ] `logout()` function that clears config
- [ ] Zero external dependencies — uses Node `http`, `open` (via `child_process.exec`), and `fetch`

**User experience:**
```
$ npx claude-count-tokens login
Opening browser for GitHub login...
✓ Logged in as vitoria
Your widget embed:
  <claude-token-heatmap user="vitoria" palette="spring">
```

---

### CCT-4: Sync module (`server/sync.js`)

**Type:** Feature
**Priority:** P1

**Description:**
Implement `npx claude-count-tokens sync` — exports token data and uploads to Supabase Storage.

**Acceptance criteria:**
- [ ] `sync(options)` function that:
  1. Reads config (errors if not logged in)
  2. Runs existing `discoverLogFiles()` + `parseLogFiles()` to get token data
  3. Uploads JSON to Supabase Storage at `token-data/{username}.json` via REST API
  4. Handles token refresh if access token expired
  5. Prints success: "✓ Synced {N} tokens to cloud. Widget is live."
- [ ] Accepts same `--days`, `--projects-dir`, `--project` flags as existing CLI
- [ ] Zero external dependencies — uses Node built-in `fetch`

**API call:**
```
PUT {SUPABASE_URL}/storage/v1/object/token-data/{username}.json
Authorization: Bearer {access_token}
Content-Type: application/json
Body: {token data JSON}
```

---

### CCT-5: Background daemon (`server/daemon.js`)

**Type:** Feature
**Priority:** P2

**Description:**
Implement `npx claude-count-tokens sync --install` — installs a macOS launchd agent for hourly auto-sync.

**Acceptance criteria:**
- [ ] `installDaemon()` — generates and installs launchd plist at `~/Library/LaunchAgents/com.claude-count-tokens.sync.plist`
- [ ] Runs `npx claude-count-tokens sync` every hour
- [ ] Loads the agent with `launchctl load`
- [ ] `uninstallDaemon()` — unloads and removes the plist
- [ ] `statusDaemon()` — checks if daemon is loaded
- [ ] Prints clear success/failure messages

**Plist config:**
- Label: `com.claude-count-tokens.sync`
- StartInterval: 3600 (every hour)
- StandardOutPath / StandardErrorPath: `~/.claude-count-tokens/sync.log`

**User experience:**
```
$ npx claude-count-tokens sync --install
✓ Installed background sync (runs every hour)
  Logs: ~/.claude-count-tokens/sync.log
  To uninstall: npx claude-count-tokens sync --uninstall
```

---

### CCT-6: Wire up CLI commands (`server/index.js`)

**Type:** Feature
**Priority:** P1

**Description:**
Modify the CLI entry point to route `login`, `logout`, `sync`, `sync --install`, `sync --uninstall` commands.

**Acceptance criteria:**
- [ ] `npx claude-count-tokens login` → calls `auth.login()`
- [ ] `npx claude-count-tokens logout` → calls `auth.logout()`
- [ ] `npx claude-count-tokens sync` → calls `sync.sync()`
- [ ] `npx claude-count-tokens sync --install` → calls `daemon.installDaemon()`
- [ ] `npx claude-count-tokens sync --uninstall` → calls `daemon.uninstallDaemon()`
- [ ] Existing commands (`export`, server mode) unchanged
- [ ] Clear error messages for auth-required commands when not logged in

---

### CCT-7: Widget `user` attribute

**Type:** Feature
**Priority:** P1

**Description:**
Add `user` attribute to the web component so it can fetch data from Supabase Storage by username.

**Acceptance criteria:**
- [ ] Add `'user'` to `observedAttributes`
- [ ] When `user` attribute is set, construct URL: `{SUPABASE_URL}/storage/v1/object/public/token-data/{user}.json`
- [ ] Fetch and render data from that URL
- [ ] `src` attribute still works for static/local files (backwards compatible)
- [ ] `user` attribute takes precedence over `src` if both are set
- [ ] Supabase URL constant defined at top of widget file

**Usage:**
```html
<!-- Cloud-backed (live) -->
<claude-token-heatmap user="vitoria" palette="spring">

<!-- Static file (existing behavior, unchanged) -->
<claude-token-heatmap src="./claude-token-data.json" palette="spring">
```

---

### CCT-8: Update package.json

**Type:** Chore
**Priority:** P2

**Description:**
Update package.json to include new server files.

**Acceptance criteria:**
- [ ] New files included in `files` array
- [ ] Version bumped to 1.1.0

---

## Execution order

1. CCT-1 (Supabase migration) + CCT-2 (config) — no dependencies, build in parallel
2. CCT-3 (auth) — depends on CCT-1 + CCT-2
3. CCT-4 (sync) — depends on CCT-2 + CCT-3
4. CCT-5 (daemon) — depends on CCT-4
5. CCT-6 (CLI wiring) — depends on CCT-3 + CCT-4 + CCT-5
6. CCT-7 (widget) — independent, can build anytime
7. CCT-8 (package.json) — last
