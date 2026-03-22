# claude-count-tokens

A GitHub-style contribution heatmap for your Claude Code token usage. Add it to your website — it stays up to date automatically.

```
┌─────────────────────────────────────────────────────────────┐
│  Your Claude Code Token Usage                        2026   │
│                                                             │
│  Mon  ░░▒▒░░▓▓░░▒▒░░██▒▒░░▓▓░░▒▒░░██░░▒▒░░▓▓░░▒▒░░██░░  │
│  Wed  ▒▒░░▓▓░░██░░▒▒░░▓▓░░██▒▒░░▓▓░░▒▒░░██░░▒▒░░▓▓░░██  │
│  Fri  ░░██▒▒░░▓▓░░▒▒░░██▒▒░░▓▓░░▒▒░░██░░▓▓░░▒▒░░██░░▒▒  │
│                                                             │
│  Less ░░▒▒▓▓██ More                        1.2M tokens      │
└─────────────────────────────────────────────────────────────┘
```

## Quick start

Three commands, then you're done forever:

```bash
npx claude-count-tokens login              # 1. log in with GitHub
npx claude-count-tokens sync               # 2. upload your token data
npx claude-count-tokens sync --install     # 3. auto-sync every hour
```

Then add two lines to your website:

```html
<script src="https://unpkg.com/claude-count-tokens/widget/claude-token-heatmap.js"></script>
<claude-token-heatmap user="YOUR_GITHUB_USERNAME" palette="spring">
```

That's it. Your heatmap stays up to date automatically.

## How it works

```
  Your Mac                          Cloud                        Your Website
 ┌────────────────┐            ┌──────────────┐             ┌──────────────────┐
 │                │   sync     │              │   fetch      │                  │
 │  Claude Code   │ ────────>  │   Supabase   │ <────────── │  <claude-token-  │
 │  local logs    │  (hourly)  │   Storage    │  (on load)   │   heatmap>       │
 │                │            │              │             │                  │
 │  ~/.claude/    │            │  yourname    │             │  Renders the     │
 │  projects/     │            │  .json       │             │  heatmap widget  │
 │                │            │              │             │                  │
 └────────────────┘            └──────────────┘             └──────────────────┘
        │                                                           │
        │  launchd runs                                             │
        │  sync every hour                                          │
        └── automatically ─────────────────────────────────────────>│
                                keeps your widget up to date
```

1. **Login** — authenticates you via GitHub so we know your username
2. **Sync** — reads your local Claude Code logs, aggregates token counts, uploads the result as a small JSON file
3. **Auto-sync** — a background job on your Mac re-syncs every hour so your widget is always current
4. **Widget** — a self-contained web component that fetches your JSON and renders the heatmap

No data leaves your machine except the aggregated token counts (no prompts, no code, no conversation content).

## Step-by-step setup

### 1. Log in

```bash
npx claude-count-tokens login
```

This opens your browser for GitHub login. Once authenticated, you'll see:

```
Opening browser for GitHub login...
✓ Logged in as vitoria

Your widget embed:
  <claude-token-heatmap user="vitoria" palette="spring">
```

### 2. Sync your data

```bash
npx claude-count-tokens sync
```

```
  Parsing local Claude Code logs...
  Found 1.2M tokens across 84 days
  Uploading to cloud...

  ✓ Synced to cloud. Widget is live.
```

### 3. Set up auto-sync (recommended)

```bash
npx claude-count-tokens sync --install
```

This installs a background job that syncs every hour. You never have to think about it again.

```
  ✓ Installed background sync (runs every hour)
  Logs: ~/.claude-count-tokens/sync.log
  To uninstall: npx claude-count-tokens sync --uninstall
```

### 4. Add the widget to your site

Add these two lines anywhere in your HTML:

```html
<script src="https://unpkg.com/claude-count-tokens/widget/claude-token-heatmap.js"></script>
<claude-token-heatmap user="YOUR_GITHUB_USERNAME" palette="spring">
```

Works with any site — plain HTML, Next.js, Astro, Hugo, Jekyll, WordPress, anything. No build step, no dependencies, no framework required.

## Dark mode

The widget automatically follows your site's theme. No extra code needed.

It detects dark mode from:
- `prefers-color-scheme` (system preference)
- `class="dark"` on `<html>` or `<body>`
- `data-theme="dark"` on `<html>` or `<body>`

To force a specific theme:
```html
<claude-token-heatmap user="vitoria" theme="dark"></claude-token-heatmap>
```

## Color palettes

The default palette is **spring**. To pick a different one, add a `palette` attribute:

```html
<claude-token-heatmap user="vitoria" palette="mint"></claude-token-heatmap>
```

Available palettes:

`fern` · `sage` · `moss` · `mint` · `spring` · `eucalyptus` · `pistachio` · `clover` · `jade` · `matcha` · `tea` · `basil`

Or define your own with CSS custom properties:

```css
claude-token-heatmap {
  --cth-cell-l1: #d4e4c8;
  --cth-cell-l2: #b5cda3;
  --cth-cell-l3: #94b47e;
  --cth-cell-l4: #6e9a56;
}
```

## Live dashboard

Want to see your usage locally while you code?

```bash
npx claude-count-tokens
```

Opens a live dashboard at `http://localhost:7890` that updates in real-time as you use Claude Code.

## CLI reference

```
npx claude-count-tokens                     # live dashboard on port 7890
npx claude-count-tokens --port 3000         # custom port
npx claude-count-tokens --days 90           # last 90 days only

npx claude-count-tokens login               # log in with GitHub
npx claude-count-tokens logout              # log out, clear credentials

npx claude-count-tokens sync               # upload token data to cloud
npx claude-count-tokens sync --install     # auto-sync every hour (macOS)
npx claude-count-tokens sync --uninstall   # remove auto-sync
npx claude-count-tokens sync --status      # check if auto-sync is running

npx claude-count-tokens export             # export to ./claude-token-data.json
npx claude-count-tokens export -o out.json # custom output path
```

## What gets counted

The widget reads local JSONL logs that Claude Code writes at `~/.claude/projects/`. For each AI response, it sums:

| Type | What it is |
|------|-----------|
| Input | tokens in your prompt |
| Output | tokens Claude generated |
| Cache write | tokens written to context cache |
| Cache read | tokens read from context cache |

This is different from your Claude account's usage page, which tracks billing across all Claude products. This widget only shows Claude Code CLI usage from your machine's local logs.

## Privacy

Only aggregated token counts are synced to the cloud — **no prompts, no code, no conversation content**. The sync uploads a small JSON file with daily/hourly token totals. Everything else stays on your machine.

## Requirements

- Node.js 18+
- Claude Code installed (creates `~/.claude/projects/`)
- macOS for auto-sync (Linux users can use a cron job instead)

## License

MIT
