# claude-count-tokens

A GitHub-style contribution heatmap for your Claude Code token usage. Add it to your personal website in two steps.

## Add to your website

### 1. Generate your data

```bash
npx claude-count-tokens export
```

This reads your local Claude Code logs and creates a `claude-token-data.json` file. Copy it into your website's public/static folder.

### 2. Add two lines to your HTML

```html
<script src="https://unpkg.com/claude-count-tokens/widget/claude-token-heatmap.js"></script>
<claude-token-heatmap src="./claude-token-data.json"></claude-token-heatmap>
```

Done. No build step, no dependencies, no framework required. Works with any static site, Next.js, Astro, Hugo, Jekyll, plain HTML — anything.

### Updating your data

Re-run the export whenever you want your widget to reflect recent usage:

```bash
npx claude-count-tokens export -o ./public/claude-token-data.json
```

To automate it, add a cron job or a pre-deploy script:

```bash
# crontab -e — update daily at 2am
0 2 * * * npx claude-count-tokens export -o /path/to/site/claude-token-data.json

# or in your deploy script / CI
npx claude-count-tokens export -o public/claude-token-data.json && npm run build
```

## Dark mode

The widget automatically follows your site's theme. No extra code needed.

It detects dark mode from:
- `prefers-color-scheme` (system preference)
- `class="dark"` on `<html>` or `<body>`
- `data-theme="dark"` on `<html>` or `<body>`

If your site has a dark mode toggle, the widget will switch with it.

To force a specific theme:
```html
<claude-token-heatmap src="./data.json" theme="dark"></claude-token-heatmap>
```

## Color palettes

Pick a color palette with a single attribute:

```html
<claude-token-heatmap src="./data.json" palette="spring"></claude-token-heatmap>
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

If you just want to see your own usage locally while you code:

```bash
npx claude-count-tokens
```

Opens a live dashboard at `http://localhost:7890` that updates in real-time as you use Claude Code.

## CLI reference

```
npx claude-count-tokens                     # live dashboard on port 7890
npx claude-count-tokens --port 3000         # custom port
npx claude-count-tokens export              # export to ./claude-token-data.json
npx claude-count-tokens export -o data.json # custom output path
npx claude-count-tokens --days 90           # last 90 days only
```

## What gets counted

The widget reads local JSONL logs that Claude Code writes at `~/.claude/projects/`. For each AI response, it sums:

| Type | What it is |
|------|-----------|
| Input | tokens in your prompt |
| Output | tokens Claude generated |
| Cache write | tokens written to context cache |
| Cache read | tokens read from context cache |

For older Claude Code versions that didn't record token usage, the widget estimates activity from your prompt history.

This is different from your Claude account's usage page, which tracks billing across all Claude products. This widget only shows Claude Code CLI usage from your machine's local logs.

## How it works

```
~/.claude/projects/**/*.jsonl  →  parser  →  JSON  →  <claude-token-heatmap>
```

The CLI scans your local Claude Code conversation logs, aggregates token usage by day/hour/month, and outputs a JSON file. The web component is a self-contained custom element that renders the data as a heatmap. Click any day to see an hourly breakdown.

## Privacy

Everything runs on your machine. The CLI reads local files. The widget is a static web component. No data is sent anywhere.

## Requirements

- Node.js 18+ (for the CLI)
- Claude Code installed (creates `~/.claude/projects/`)

## License

MIT
