/**
 * <claude-token-heatmap> — GitHub-style token usage heatmap web component
 *
 * Attributes: src, theme ("light"/"dark"), locale
 * Property:   .tokenData = { ... }
 */

class ClaudeTokenHeatmap extends HTMLElement {
  // Supabase Storage public URL — replace with your project's URL
  static SUPABASE_STORAGE_URL = 'https://huppfkdgepvwvucrjdaa.supabase.co/storage/v1/object/public/token-data';

  static get observedAttributes() { return ['src', 'user', 'theme', 'locale', 'palette']; }

  static PALETTES = {
    fern:        ['#dbe8d0', '#b6d4a0', '#8bba76', '#629e4e'],
    sage:        ['#dce5d4', '#bccfab', '#96b882', '#6f9e5c'],
    moss:        ['#d5e0cd', '#aec9a0', '#87b074', '#5f964c'],
    mint:        ['#d2ead8', '#a8d4b4', '#7dbd90', '#54a46c'],
    spring:      ['#dbebc7', '#b8d69a', '#90c06c', '#68a844'],
    eucalyptus:  ['#d8e5d2', '#b4cdaa', '#8fb682', '#6b9d5c'],
    pistachio:   ['#e0e8c8', '#c4d4a0', '#a4bd78', '#82a454'],
    clover:      ['#d0e4d0', '#a6cca6', '#7cb47c', '#559c55'],
    jade:        ['#cce5d8', '#99ccb4', '#66b290', '#3d996e'],
    matcha:      ['#d4e4c8', '#b5cda3', '#94b47e', '#6e9a56'],
    tea:         ['#dde4c4', '#c0cea0', '#9eb87a', '#7ca054'],
    basil:       ['#d0dece', '#a4c0a0', '#78a474', '#50884c'],
  };

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null;
    this._selectedYear = new Date().getFullYear();
  }

  connectedCallback() {
    this._render();
    this._applyPalette(this.getAttribute('palette') || 'spring');
    // user attribute takes precedence — fetches from Supabase Storage
    if (this.getAttribute('user')) {
      const user = this.getAttribute('user');
      this._fetchData(`${ClaudeTokenHeatmap.SUPABASE_STORAGE_URL}/${user}.json`);
    } else if (this.getAttribute('src')) {
      this._fetchData(this.getAttribute('src'));
    }
    this._watchHostTheme();
  }

  disconnectedCallback() {
    if (this._themeObserver) this._themeObserver.disconnect();
  }

  _watchHostTheme() {
    // Auto-detect dark mode from host page (class or data-attribute on html/body)
    if (this.getAttribute('theme')) return; // explicit theme set, don't override

    const detect = () => {
      const html = document.documentElement;
      const body = document.body;
      const isDark =
        html.classList.contains('dark') ||
        body.classList.contains('dark') ||
        html.dataset.theme === 'dark' ||
        body.dataset.theme === 'dark' ||
        html.getAttribute('color-scheme') === 'dark';

      const isLight =
        html.classList.contains('light') ||
        body.classList.contains('light') ||
        html.dataset.theme === 'light' ||
        body.dataset.theme === 'light';

      if (isDark) this.setAttribute('theme', 'dark');
      else if (isLight) this.setAttribute('theme', 'light');
      else this.removeAttribute('theme'); // fall back to prefers-color-scheme
    };

    detect();
    this._themeObserver = new MutationObserver(detect);
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'color-scheme'] });
    this._themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'color-scheme'] });
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'user' && newVal && newVal !== oldVal) {
      this._fetchData(`${ClaudeTokenHeatmap.SUPABASE_STORAGE_URL}/${newVal}.json`);
    } else if (name === 'src' && newVal && newVal !== oldVal) {
      this._fetchData(newVal);
    } else if (name === 'palette') {
      this._applyPalette(newVal);
    } else if (this._data) {
      this._renderWithData();
    }
  }

  _applyPalette(name) {
    const colors = ClaudeTokenHeatmap.PALETTES[name];
    if (!colors) return;
    this.style.setProperty('--cth-cell-l1', colors[0]);
    this.style.setProperty('--cth-cell-l2', colors[1]);
    this.style.setProperty('--cth-cell-l3', colors[2]);
    this.style.setProperty('--cth-cell-l4', colors[3]);
    this.style.setProperty('--cth-bar-color', colors[1]);
    this.style.setProperty('--cth-bar-hover', colors[3]);
    this.style.setProperty('--cth-year-active-bg', colors[2]);
  }

  set tokenData(data) { this._data = data; this._renderWithData(); }
  get tokenData() { return this._data; }

  async _fetchData(url) {
    try {
      const res = await fetch(url);
      this._data = await res.json();
      this._renderWithData();
    } catch (err) {
      console.error('claude-token-heatmap: fetch failed', err);
    }
  }

  _render() {
    this.shadowRoot.innerHTML = `<style>${this._styles()}</style>
      <div class="cth"><div class="cth-loading">Loading token data...</div></div>`;
  }

  _getAvailableYears() {
    // Show all years from 2025 (Claude Code launch) to current year
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear; y >= 2025; y--) {
      years.push(y);
    }
    return years; // newest first
  }

  _getYearRange() {
    const year = this._selectedYear;
    // Always start at Jan 1 for consistent grid
    const start = new Date(year, 0, 1);
    const gridEnd = new Date(year, 11, 31);
    const today = new Date();
    const dataEnd = gridEnd > today ? today : gridEnd;
    // Launch date — cells before this are "pre-launch"
    const launchDate = new Date(2025, 1, 24);
    return { start, gridEnd, dataEnd, launchDate, label: String(year) };
  }

  _computeYearSummary(start, end) {
    const data = this._data;
    let totalTokens = 0, totalDays = 0;
    let busiestDay = { date: '', tokens: 0 };

    for (const [date, d] of Object.entries(data.daily)) {
      const dt = new Date(date + 'T12:00:00');
      if (dt < start || dt > end) continue;
      totalTokens += d.tokens;
      totalDays++;
      if (d.tokens > busiestDay.tokens) busiestDay = { date, tokens: d.tokens };
    }

    return {
      totalTokens,
      totalDays,
      dailyAverage: totalDays > 0 ? Math.round(totalTokens / totalDays) : 0,
      busiestDay: busiestDay.date ? busiestDay : { date: this._dateStr(end), tokens: 0 },
    };
  }

  _renderWithData() {
    if (this._bdayRAF) { cancelAnimationFrame(this._bdayRAF); this._bdayRAF = null; }

    const data = this._data;
    if (!data) return;

    const years = this._getAvailableYears();
    const { start, gridEnd, dataEnd, launchDate, label } = this._getYearRange();
    const summary = this._computeYearSummary(launchDate > start ? launchDate : start, dataEnd);
    const { gridHTML, monthLabelsHTML, totalCols } = this._buildGrid(data, start, gridEnd, dataEnd, launchDate);

    this.shadowRoot.innerHTML = `<style>${this._styles()}</style>
      <div class="cth">
        <div class="cth-main">
          <header class="cth-header">
            <h2 class="cth-title">
              <svg class="cth-icon-heart" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span>${this._fmt(summary.totalTokens)} tokens</span>
              <span class="cth-subtitle">in ${label}</span>
            </h2>
            <div class="cth-stats">
              <div class="cth-stat"><span class="cth-stat-val">${this._fmt(summary.dailyAverage)}</span><span class="cth-stat-lbl">daily avg</span></div>
              <div class="cth-stat"><span class="cth-stat-val">${summary.busiestDay.date ? this._fmtDate(new Date(summary.busiestDay.date + 'T12:00:00')) : '—'}</span><span class="cth-stat-lbl">busiest day</span></div>
              <div class="cth-stat"><span class="cth-stat-val">${this._fmt(summary.busiestDay.tokens)}</span><span class="cth-stat-lbl">peak tokens</span></div>
            </div>
          </header>

          <div class="cth-graph-area">
            <div class="cth-months">${monthLabelsHTML}</div>
            <div class="cth-graph">
              <div class="cth-days"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div>
              <div class="cth-grid">${gridHTML}</div>
            </div>
          </div>

          <footer class="cth-foot">
            <a class="cth-learn-link" href="javascript:void(0)">learn how we count tokens</a>
            <div class="cth-legend">
              <span class="cth-legend-txt">Less</span>
              <div class="cth-cell" data-level="0"></div>
              <div class="cth-cell" data-level="1"></div>
              <div class="cth-cell" data-level="2"></div>
              <div class="cth-cell" data-level="3"></div>
              <div class="cth-cell" data-level="4"></div>
              <span class="cth-legend-txt">More</span>
            </div>
          </footer>

          <div class="cth-info-popover" hidden>
            <div class="cth-info-title">How we count tokens</div>
            <div class="cth-info-body">
              <p>This widget reads your local Claude Code conversation logs stored at <code>~/.claude/projects/</code> on your machine. Nothing is sent to any server.</p>
              <p>For each AI response, we sum four token types:</p>
              <ul>
                <li><strong>Input</strong> — tokens in your prompt sent to Claude</li>
                <li><strong>Output</strong> — tokens Claude generated in response</li>
                <li><strong>Cache write</strong> — tokens written to context cache</li>
                <li><strong>Cache read</strong> — tokens read from context cache</li>
              </ul>
              <p>This differs from your Claude account settings, which tracks billing-level usage across all Claude products. This widget only counts Claude Code CLI usage from this machine's local logs.</p>
              <p>For older sessions where your Claude Code version didn't record detailed usage, we estimate activity from your prompt history (~4K tokens per prompt).</p>
            </div>
          </div>
        </div>

        <div class="cth-years">
          ${years.map(y => `<button class="cth-year-btn ${this._selectedYear === y ? 'active' : ''}" data-year="${y}">${y}</button>`).join('')}
        </div>

        <div class="cth-popover" hidden>
          <div class="cth-pop-head">
            <span class="cth-pop-date"></span>
            <span class="cth-pop-total"></span>
          </div>
          <div class="cth-pop-breakdown"></div>
          <div class="cth-pop-chart-lbl">Hourly breakdown</div>
          <div class="cth-pop-chart-wrap">
            <div class="cth-pop-chart"></div>
            <div class="cth-pop-tooltip" hidden></div>
          </div>
          <div class="cth-pop-hours"><span>12a</span><span>6a</span><span>12p</span><span>6p</span></div>
        </div>
      </div>`;

    this._attachEvents();
    this._positionMonthLabels();
    this._initBirthdayCanvas();
  }

  _buildGrid(data, start, gridEnd, dataEnd, launchDate) {
    const selectedYear = this._selectedYear;
    const gridStart = new Date(start);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());

    // Quantiles from valid data range only (post-launch)
    const effectiveStart = launchDate > start ? launchDate : start;
    const vals = [];
    for (const [date, d] of Object.entries(data.daily)) {
      const dt = new Date(date + 'T12:00:00');
      if (dt >= effectiveStart && dt <= dataEnd && d.tokens > 0) vals.push(d.tokens);
    }
    vals.sort((a, b) => a - b);
    const q1 = vals[Math.floor(vals.length * 0.25)] || 1;
    const q2 = vals[Math.floor(vals.length * 0.5)] || 1;
    const q3 = vals[Math.floor(vals.length * 0.75)] || 1;

    let cells = '';
    const monthPos = new Map();
    const cursor = new Date(gridStart);
    let col = 0;

    while (cursor <= gridEnd || cursor.getDay() !== 0) {
      const week = [];
      for (let row = 0; row < 7; row++) {
        const ds = this._dateStr(cursor);
        const isPadding = cursor < start;
        const isPreLaunch = cursor >= start && cursor < launchDate;
        const inDataRange = cursor >= effectiveStart && cursor <= dataEnd;
        const inGridRange = cursor >= start && cursor <= gridEnd;
        const isFuture = cursor > dataEnd && inGridRange;
        const tokens = data.daily[ds]?.tokens || 0;
        let lvl = 0;
        if (inDataRange && tokens > 0) {
          if (tokens <= q1) lvl = 1;
          else if (tokens <= q2) lvl = 2;
          else if (tokens <= q3) lvl = 3;
          else lvl = 4;
        }
        if (row === 0 && cursor.getFullYear() === selectedYear) {
          const mk = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
          if (!monthPos.has(mk)) monthPos.set(mk, col);
        }
        const isBirthday = ds === '2025-02-24';
        let cls;
        if (isPadding) cls = 'cth-cell cth-cell-out';
        else if (isBirthday) cls = 'cth-cell cth-cell-bday';
        else if (isPreLaunch) cls = 'cth-cell cth-cell-prelaunch';
        else if (!inGridRange) cls = 'cth-cell cth-cell-out';
        else if (isFuture) cls = 'cth-cell cth-cell-future';
        else cls = 'cth-cell';
        const title = isBirthday ? 'Claude Code was born!' : (inDataRange ? `${this._fmtDate(cursor)}: ${this._fmt(tokens)} tokens` : '');
        week.push(`<div class="${cls}" data-level="${inDataRange ? lvl : ''}" data-date="${ds}" data-tokens="${tokens}" ${isBirthday ? 'data-birthday="true"' : ''} title="${title}"></div>`);
        cursor.setDate(cursor.getDate() + 1);
      }
      cells += `<div class="cth-col">${week.join('')}</div>`;
      col++;
      if (cursor > gridEnd && cursor.getDay() === 0) break;
    }

    const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let mHTML = '';
    let lastLabelCol = -4;
    for (const [mk, ci] of monthPos) {
      if (ci - lastLabelCol < 3) continue;
      const mi = parseInt(mk.split('-')[1], 10) - 1;
      // Use percentage-based positioning so labels scale with grid
      mHTML += `<span class="cth-month-lbl" data-col="${ci}">${mNames[mi]}</span>`;
      lastLabelCol = ci;
    }

    return { gridHTML: cells, monthLabelsHTML: mHTML, totalCols: col };
  }

  _attachEvents() {
    const root = this.shadowRoot;
    const grid = root.querySelector('.cth-grid');
    const popover = root.querySelector('.cth-popover');

    // Year buttons
    root.querySelectorAll('.cth-year-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const y = btn.dataset.year;
        this._selectedYear = parseInt(y, 10);
        this._renderWithData();
      });
    });

    // Cell click → popover or birthday
    grid.addEventListener('click', (e) => {
      const cell = e.target.closest('.cth-cell');
      if (!cell || cell.classList.contains('cth-cell-out')) return;

      if (cell.dataset.birthday) {
        this._showBirthday(cell);
        return;
      }

      const tokens = parseInt(cell.dataset.tokens, 10);
      if (!tokens) return;
      this._showPopover(cell, cell.dataset.date, tokens);
    });

    // Learn link
    const learnLink = root.querySelector('.cth-learn-link');
    const infoPop = root.querySelector('.cth-info-popover');
    if (learnLink) {
      learnLink.addEventListener('click', (e) => {
        e.stopPropagation();
        popover.hidden = true;
        infoPop.hidden = !infoPop.hidden;
      });
    }

    // Close popovers
    root.addEventListener('click', (e) => {
      if (!e.target.closest('.cth-cell') && !e.target.closest('.cth-popover')) popover.hidden = true;
      if (!e.target.closest('.cth-learn-link') && !e.target.closest('.cth-info-popover')) infoPop.hidden = true;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { popover.hidden = true; infoPop.hidden = true; }
    });
  }

  _showPopover(cell, dateStr, tokens) {
    const data = this._data;
    const pop = this.shadowRoot.querySelector('.cth-popover');
    const dateObj = new Date(dateStr + 'T12:00:00');

    // Reset visibility (birthday hides these)
    pop.querySelector('.cth-pop-chart-lbl').style.display = '';
    pop.querySelector('.cth-pop-chart-wrap').style.display = '';
    pop.querySelector('.cth-pop-hours').style.display = '';

    pop.querySelector('.cth-pop-date').textContent = this._fmtDateLong(dateObj);
    pop.querySelector('.cth-pop-total').textContent = this._fmt(tokens) + ' tokens';

    const dd = data.daily[dateStr];
    // Detect estimated data: has tokens but zero output + zero cache = from history.jsonl
    const isEstimated = dd && dd.outputTokens === 0 && dd.cacheCreationTokens === 0 && dd.cacheReadTokens === 0;

    if (dd) {
      let breakdownHTML = [
        ['Input', dd.inputTokens], ['Output', dd.outputTokens],
        ['Cache write', dd.cacheCreationTokens], ['Cache read', dd.cacheReadTokens]
      ].map(([l, v]) => `<div class="cth-bkdn"><span>${l}</span><span>${this._fmt(v)}</span></div>`).join('');

      if (isEstimated) {
        breakdownHTML += `
          <div class="cth-estimated-notice">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="7"/><line x1="8" y1="5" x2="8" y2="8.5"/><circle cx="8" cy="11" r="0.5" fill="currentColor"/></svg>
            <span>Estimated from prompt count. Your Claude Code version at this time didn't record detailed token usage. Each prompt is estimated at ~4K tokens.</span>
          </div>`;
      }
      pop.querySelector('.cth-pop-breakdown').innerHTML = breakdownHTML;
    }

    const hours = data.hourly[dateStr] || new Array(24).fill(0);
    const maxH = Math.max(...hours, 1);
    const chart = pop.querySelector('.cth-pop-chart');
    const tooltip = pop.querySelector('.cth-pop-tooltip');

    chart.innerHTML = hours.map((v, i) => {
      const pct = (v / maxH) * 100;
      const hr = i === 0 ? '12am' : i === 12 ? '12pm' : i < 12 ? i + 'am' : (i - 12) + 'pm';
      return `<div class="cth-bar" data-hour="${hr}" data-val="${this._fmt(v)}" style="height:${Math.max(pct, 2)}%"></div>`;
    }).join('');

    // Hourly bar hover tooltips
    chart.querySelectorAll('.cth-bar').forEach(bar => {
      bar.addEventListener('mouseenter', () => {
        tooltip.textContent = `${bar.dataset.hour}: ${bar.dataset.val}`;
        tooltip.hidden = false;
        const barRect = bar.getBoundingClientRect();
        const chartRect = chart.getBoundingClientRect();
        let left = barRect.left - chartRect.left + barRect.width / 2 - 40;
        if (left < 0) left = 0;
        if (left + 80 > chartRect.width) left = chartRect.width - 80;
        tooltip.style.left = left + 'px';
        tooltip.style.bottom = (barRect.height + 6) + 'px';
      });
      bar.addEventListener('mouseleave', () => { tooltip.hidden = true; });
    });

    // Position
    const ctr = this.shadowRoot.querySelector('.cth');
    const cr = ctr.getBoundingClientRect();
    const cellR = cell.getBoundingClientRect();
    let left = cellR.left - cr.left + cellR.width / 2 - 140;
    let top = cellR.bottom - cr.top + 8;
    if (left < 4) left = 4;
    if (left + 280 > cr.width) left = cr.width - 284;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.hidden = false;
  }

  _showBirthday(cell) {
    const pop = this.shadowRoot.querySelector('.cth-popover');
    pop.querySelector('.cth-pop-date').textContent = '';
    pop.querySelector('.cth-pop-total').textContent = '';
    pop.querySelector('.cth-pop-breakdown').innerHTML = `
      <div class="cth-bday">
        <div class="cth-bday-cake">
          <div class="cth-bday-sparkles"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
          <div class="cth-bday-flames"><span></span><span></span><span></span></div>
          <div class="cth-bday-candles"><span></span><span></span><span></span></div>
          <div class="cth-bday-top"></div>
          <div class="cth-bday-base"></div>
        </div>
        <div class="cth-bday-text">happy bday claude code!</div>
        <div class="cth-bday-date">february 24, 2025</div>
      </div>`;
    pop.querySelector('.cth-pop-chart-lbl').style.display = 'none';
    pop.querySelector('.cth-pop-chart-wrap').style.display = 'none';
    pop.querySelector('.cth-pop-hours').style.display = 'none';

    const ctr = this.shadowRoot.querySelector('.cth');
    const cr = ctr.getBoundingClientRect();
    const cellR = cell.getBoundingClientRect();
    let left = cellR.left - cr.left + cellR.width / 2 - 140;
    let top = cellR.bottom - cr.top + 8;
    if (left < 4) left = 4;
    if (left + 280 > cr.width) left = cr.width - 284;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.hidden = false;
  }

  _initBirthdayCanvas() {
    const cell = this.shadowRoot.querySelector('.cth-cell-bday');
    if (!cell) return;

    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    cell.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const W = 8, H = 8;

    // Color palette: light pastel yellows + light pastel pinks + whites
    const colors = [
      [255, 250, 220],  // light pastel yellow
      [255, 248, 230],  // pale yellow
      [255, 245, 210],  // soft pastel yellow
      [255, 252, 240],  // cream white
      [255, 225, 225],  // light pastel pink
      [255, 215, 218],  // soft pink
      [255, 215, 218],  // pastel pink
      [255, 210, 215],  // rose pink
      [255, 235, 235],  // pale pink
      [255, 255, 255],  // white
      [255, 250, 245],  // warm white
      [255, 240, 235],  // pink white
    ];

    // Per-pixel state: each pixel has its own phase and speed
    const pixels = new Array(W * H);
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] = {
        colorIdx: Math.floor(Math.random() * colors.length),
        phase: Math.random() * Math.PI * 2,
        speed: 1.5 + Math.random() * 4,
        sparkle: Math.random(),       // chance to sparkle white
        nextChange: Math.random() * 60, // frames until next color change
      };
    }

    const imageData = ctx.createImageData(W, H);
    let frame = 0;

    const animate = () => {
      frame++;
      for (let i = 0; i < pixels.length; i++) {
        const p = pixels[i];
        p.nextChange--;

        // Randomly change color
        if (p.nextChange <= 0) {
          p.colorIdx = Math.floor(Math.random() * colors.length);
          p.nextChange = 10 + Math.random() * 50;
          p.speed = 1.5 + Math.random() * 4;
        }

        // Sparkle: random bright white flash
        const t = Math.sin(frame * 0.05 * p.speed + p.phase);
        const isSparkle = p.sparkle > 0.88 && t > 0.6 && Math.random() > 0.6;

        let r, g, b;
        if (isSparkle) {
          r = 255; g = 255; b = 255;
        } else {
          const c = colors[p.colorIdx];
          // Modulate brightness with sine wave
          const brightness = 0.85 + 0.15 * t;
          r = Math.min(255, c[0] * brightness);
          g = Math.min(255, c[1] * brightness);
          b = Math.min(255, c[2] * brightness);
        }

        const idx = i * 4;
        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }

      ctx.putImageData(imageData, 0, 0);
      this._bdayRAF = requestAnimationFrame(animate);
    };

    animate();
  }

  _positionMonthLabels() {
    const grid = this.shadowRoot.querySelector('.cth-grid');
    const months = this.shadowRoot.querySelector('.cth-months');
    if (!grid || !months) return;
    const cols = grid.querySelectorAll('.cth-col');
    const labels = months.querySelectorAll('.cth-month-lbl');
    const gridRect = grid.getBoundingClientRect();
    const daysWidth = this.shadowRoot.querySelector('.cth-days')?.getBoundingClientRect().width || 32;

    labels.forEach(lbl => {
      const colIdx = parseInt(lbl.dataset.col, 10);
      const colEl = cols[colIdx];
      if (!colEl) return;
      const colRect = colEl.getBoundingClientRect();
      lbl.style.left = (colRect.left - gridRect.left + daysWidth + 4) + 'px';
    });
  }

  _fmt(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }

  _fmtDate(d) {
    return d.toLocaleDateString(this.getAttribute('locale') || undefined, { month: 'short', day: 'numeric' });
  }

  _fmtDateLong(d) {
    return d.toLocaleDateString(this.getAttribute('locale') || undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  _dateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  _styles() {
    return `
      :host {
        --cth-bg: #faf9f7;
        --cth-text: #1a1a2e;
        --cth-text-muted: #7c7a85;
        --cth-text-subtle: #a8a5b0;
        --cth-border: #e8e6e1;
        --cth-cell-empty: #eeecea;
        --cth-cell-l1: #d4e4c8;
        --cth-cell-l2: #b5cda3;
        --cth-cell-l3: #94b47e;
        --cth-cell-l4: #6e9a56;
        --cth-cell-r: 3px;
        --cth-cell-s: 13px;
        --cth-cell-g: 3px;
        --cth-font: "Space Mono", "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace;
        --cth-pop-bg: #ffffff;
        --cth-pop-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
        --cth-bar-color: #b5cda3;
        --cth-bar-hover: #6e9a56;
        --cth-year-bg: transparent;
        --cth-year-active-bg: #94b47e;
        --cth-year-active-text: #ffffff;
        --cth-year-hover-bg: #f0eeea;
        display: block;
        font-family: var(--cth-font);
        color: var(--cth-text);
      }

      @media (prefers-color-scheme: dark) {
        :host {
          --cth-bg: #13111a;
          --cth-text: #e8e4f0;
          --cth-text-muted: #8b849e;
          --cth-text-subtle: #5c5670;
          --cth-border: #2a2536;
          --cth-cell-empty: #1e1a28;
          --cth-cell-l1: #1e2e26;
          --cth-cell-l2: #2d4f3a;
          --cth-cell-l3: #4a8060;
          --cth-cell-l4: #6fad88;
          --cth-pop-bg: #1e1a28;
          --cth-pop-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.15);
          --cth-bar-color: #4a8060;
          --cth-bar-hover: #6fad88;
          --cth-year-hover-bg: #252030;
          --cth-year-active-bg: #4a8060;
        }
      }

      :host([theme="dark"]) {
        --cth-bg: #13111a;
        --cth-text: #e8e4f0;
        --cth-text-muted: #8b849e;
        --cth-text-subtle: #5c5670;
        --cth-border: #2a2536;
        --cth-cell-empty: #1e1a28;
        --cth-cell-l1: #1e2e26;
        --cth-cell-l2: #2d4f3a;
        --cth-cell-l3: #4a8060;
        --cth-cell-l4: #6fad88;
        --cth-pop-bg: #1e1a28;
        --cth-pop-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.15);
        --cth-bar-color: #4a8060;
        --cth-bar-hover: #6fad88;
        --cth-year-hover-bg: #252030;
        --cth-year-active-bg: #4a8060;
      }

      :host([theme="light"]) {
        --cth-bg: #faf9f7;
        --cth-text: #1a1a2e;
        --cth-text-muted: #7c7a85;
        --cth-text-subtle: #a8a5b0;
        --cth-border: #e8e6e1;
        --cth-cell-empty: #eeecea;
        --cth-cell-l1: #d4e4c8;
        --cth-cell-l2: #b5cda3;
        --cth-cell-l3: #94b47e;
        --cth-cell-l4: #6e9a56;
        --cth-pop-bg: #ffffff;
        --cth-pop-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
        --cth-bar-color: #b5cda3;
        --cth-bar-hover: #6e9a56;
        --cth-year-hover-bg: #f0eeea;
        --cth-year-active-bg: #94b47e;
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      .cth {
        background: var(--cth-bg);
        border: 1px solid var(--cth-border);
        border-radius: 12px;
        padding: 24px;
        position: relative;
        display: flex;
        gap: 20px;
      }

      .cth-main { flex: 1; min-width: 0; }

      .cth-loading {
        color: var(--cth-text-muted);
        text-align: center;
        padding: 40px;
        font-size: 14px;
      }

      /* Year selector */
      .cth-years {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex-shrink: 0;
        padding-top: 2px;
      }

      .cth-year-btn {
        background: var(--cth-year-bg);
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 400;
        font-family: var(--cth-font);
        color: var(--cth-text-muted);
        cursor: pointer;
        text-align: right;
        transition: background 0.15s, color 0.15s;
        white-space: nowrap;
      }

      .cth-year-btn:hover {
        background: var(--cth-year-hover-bg);
        color: var(--cth-text);
      }

      .cth-year-btn.active {
        background: var(--cth-year-active-bg);
        color: var(--cth-year-active-text);
        font-weight: 400;
      }

      /* Header */
      .cth-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 20px;
        flex-wrap: wrap;
        gap: 12px;
      }

      .cth-title {
        font-size: 16px;
        font-weight: 400;
        display: flex;
        align-items: center;
        gap: 6px;
        letter-spacing: -0.01em;
      }

      .cth-subtitle { color: var(--cth-text-muted); font-weight: 400; }

      .cth-icon-heart {
        color: var(--cth-text-subtle);
        opacity: 0.5;
      }

      .cth-stats { display: flex; gap: 20px; }

      .cth-stat { display: flex; flex-direction: column; align-items: flex-end; }

      .cth-stat-val { font-size: 15px; font-weight: 400; font-variant-numeric: tabular-nums; }

      .cth-stat-lbl { font-size: 11px; color: var(--cth-text-muted); letter-spacing: 0.02em; }

      /* Graph */
      .cth-graph-area { position: relative; overflow: hidden; padding-top: 20px; }

      .cth-months { position: relative; height: 16px; margin-left: 32px; font-size: 10px; color: var(--cth-text-muted); }

      .cth-month-lbl { position: absolute; top: 0; }

      .cth-graph { display: flex; gap: 4px; }

      .cth-days {
        display: flex; flex-direction: column; gap: 2px;
        padding-top: 1px; width: 28px; flex-shrink: 0;
      }

      .cth-days span {
        flex: 1; max-height: 15px;
        font-size: 10px; color: var(--cth-text-muted);
        display: flex; align-items: center; line-height: 1;
      }

      .cth-grid { display: flex; gap: 2px; flex: 1; min-width: 0; }

      .cth-col { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }

      .cth-cell {
        width: 100%; aspect-ratio: 1; max-height: 15px;
        border-radius: var(--cth-cell-r); background: var(--cth-cell-empty);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        cursor: default;
      }

      .cth-cell[data-level="1"] { background: var(--cth-cell-l1); }
      .cth-cell[data-level="2"] { background: var(--cth-cell-l2); }
      .cth-cell[data-level="3"] { background: var(--cth-cell-l3); }
      .cth-cell[data-level="4"] { background: var(--cth-cell-l4); }

      .cth-cell:not(.cth-cell-out)[data-level]:not([data-level=""]):hover {
        transform: scale(1.3);
        box-shadow: 0 0 6px rgba(0, 0, 0, 0.15);
        cursor: pointer; z-index: 2; position: relative;
      }

      .cth-cell-out { background: transparent; }

      .cth-cell-future { background: var(--cth-cell-empty); opacity: 0.4; }

      .cth-cell-prelaunch { background: var(--cth-cell-empty); opacity: 0.25; }

      /* Footer */
      .cth-foot { margin-top: 12px; display: flex; justify-content: space-between; align-items: center; padding-left: 32px; }

      .cth-legend { display: flex; align-items: center; gap: 4px; }

      .cth-legend-txt { font-size: 11px; color: var(--cth-text-muted); padding: 0 4px; }

      .cth-legend .cth-cell { width: 11px; height: 11px; cursor: default; }
      .cth-legend .cth-cell:hover { transform: none; box-shadow: none; }

      /* Popover */
      .cth-popover {
        position: absolute; width: 280px;
        background: var(--cth-pop-bg); border: 1px solid var(--cth-border);
        border-radius: 12px; padding: 16px;
        box-shadow: var(--cth-pop-shadow);
        z-index: 100;
        opacity: 0; transform: translateY(4px);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }

      .cth-popover:not([hidden]) { opacity: 1; transform: translateY(0); }
      .cth-popover[hidden] { display: none; }

      .cth-pop-head {
        display: flex; justify-content: space-between;
        align-items: baseline; margin-bottom: 10px;
      }

      .cth-pop-date { font-size: 13px; font-weight: 400; }

      .cth-pop-total { font-size: 13px; font-weight: 400; color: var(--cth-cell-l4); }

      .cth-pop-breakdown { margin-bottom: 12px; }

      .cth-bkdn {
        display: flex; justify-content: space-between;
        font-size: 11px; color: var(--cth-text-muted);
        padding: 2px 0; font-variant-numeric: tabular-nums;
      }

      .cth-pop-chart-lbl {
        font-size: 10px; color: var(--cth-text-subtle);
        text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;
      }

      .cth-pop-chart-wrap { position: relative; }

      .cth-pop-chart {
        display: flex; align-items: flex-end; gap: 2px; height: 60px;
      }

      .cth-bar {
        flex: 1; background: var(--cth-bar-color);
        border-radius: 2px 2px 0 0; min-height: 2px;
        transition: background 0.15s ease; cursor: pointer;
      }

      .cth-bar:hover { background: var(--cth-bar-hover); }

      .cth-pop-tooltip {
        position: absolute;
        background: var(--cth-text);
        color: var(--cth-bg);
        font-size: 11px;
        font-weight: 400;
        padding: 3px 8px;
        border-radius: 6px;
        white-space: nowrap;
        pointer-events: none;
        font-variant-numeric: tabular-nums;
      }

      .cth-pop-tooltip[hidden] { display: none; }

      .cth-pop-hours {
        display: flex; justify-content: space-between;
        font-size: 9px; color: var(--cth-text-subtle);
        margin-top: 4px; padding: 0 1px;
      }

      /* Learn link */
      .cth-learn-link {
        font-size: 11px;
        color: var(--cth-text-subtle);
        text-decoration: none;
        cursor: pointer;
        transition: color 0.15s;
      }

      .cth-learn-link:hover {
        color: var(--cth-text-muted);
      }

      /* Info popover */
      .cth-info-popover {
        position: relative;
        width: 100%;
        background: var(--cth-pop-bg);
        border: 1px solid var(--cth-border);
        border-radius: 12px;
        padding: 20px;
        margin-top: 12px;
        box-shadow: var(--cth-pop-shadow);
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }

      .cth-info-popover:not([hidden]) { opacity: 1; transform: translateY(0); }
      .cth-info-popover[hidden] { display: none; }

      .cth-info-title {
        font-size: 13px;
        font-weight: 400;
        margin-bottom: 10px;
      }

      .cth-info-body {
        font-size: 11px;
        color: var(--cth-text-muted);
        line-height: 1.6;
      }

      .cth-info-body p { margin-bottom: 8px; }

      .cth-info-body ul {
        margin: 4px 0 8px 16px;
        padding: 0;
      }

      .cth-info-body li { margin-bottom: 3px; }

      .cth-info-body strong { color: var(--cth-text); font-weight: 400; }

      .cth-info-body code {
        font-family: var(--cth-font);
        font-size: 10px;
        background: var(--cth-cell-empty);
        padding: 1px 4px;
        border-radius: 3px;
      }

      /* Estimated data notice */
      .cth-estimated-notice {
        display: flex;
        gap: 6px;
        align-items: flex-start;
        margin-top: 8px;
        padding: 8px;
        background: var(--cth-cell-empty);
        border-radius: 6px;
        font-size: 10px;
        color: var(--cth-text-muted);
        line-height: 1.4;
      }

      .cth-estimated-notice svg {
        flex-shrink: 0;
        margin-top: 1px;
        opacity: 0.6;
      }

      /* Birthday cell */
      .cth-cell-bday {
        cursor: pointer !important;
        position: relative;
        overflow: hidden;
        background: transparent !important;
        padding: 0 !important;
      }

      .cth-cell-bday canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border-radius: var(--cth-cell-r);
        image-rendering: pixelated;
      }

      .cth-cell-bday:hover {
        transform: scale(1.3) !important;
      }

      /* Pixel cake */
      .cth-bday {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 12px 0 4px;
        gap: 8px;
      }

      .cth-bday-cake {
        display: flex;
        flex-direction: column;
        align-items: center;
        image-rendering: pixelated;
        position: relative;
      }

      .cth-bday-sparkles {
        position: absolute;
        top: -14px;
        left: -8px;
        right: -8px;
        height: 20px;
        overflow: visible;
      }

      .cth-bday-sparkles span {
        position: absolute;
        width: 3px;
        height: 3px;
        background: #fce588;
        border-radius: 1px;
      }

      .cth-bday-sparkles span:nth-child(1) { left: 5px; animation: cth-spark 0.7s 0.1s ease-out infinite; }
      .cth-bday-sparkles span:nth-child(2) { left: 15px; animation: cth-spark 0.9s 0.4s ease-out infinite; }
      .cth-bday-sparkles span:nth-child(3) { left: 25px; animation: cth-spark 0.6s 0s ease-out infinite; }
      .cth-bday-sparkles span:nth-child(4) { left: 35px; animation: cth-spark 0.8s 0.3s ease-out infinite; }
      .cth-bday-sparkles span:nth-child(5) { left: 45px; animation: cth-spark 0.7s 0.6s ease-out infinite; }
      .cth-bday-sparkles span:nth-child(6) { left: 55px; animation: cth-spark 1s 0.2s ease-out infinite; }
      .cth-bday-sparkles span:nth-child(7) { left: 10px; animation: cth-spark 0.8s 0.5s ease-out infinite; }
      .cth-bday-sparkles span:nth-child(8) { left: 40px; animation: cth-spark 0.6s 0.7s ease-out infinite; }

      @keyframes cth-spark {
        0% { opacity: 0; transform: translateY(6px) scale(0); }
        30% { opacity: 1; transform: translateY(-2px) scale(1.2); }
        60% { opacity: 0.8; transform: translateY(-8px) scale(0.8); }
        100% { opacity: 0; transform: translateY(-14px) scale(0); }
      }

      .cth-bday-flames {
        display: flex;
        gap: 10px;
        margin-bottom: 2px;
      }

      .cth-bday-flames span {
        width: 4px;
        height: 6px;
        background: #fce588;
        border-radius: 50% 50% 20% 20%;
      }

      .cth-bday-flames span:nth-child(1) { animation: cth-flame1 0.3s ease-in-out infinite; }
      .cth-bday-flames span:nth-child(2) { animation: cth-flame2 0.4s 0.1s ease-in-out infinite; }
      .cth-bday-flames span:nth-child(3) { animation: cth-flame3 0.35s 0.25s ease-in-out infinite; }

      @keyframes cth-flame1 {
        0%, 100% { transform: scaleY(1); background: #fce588; }
        40% { transform: scaleY(1.5); background: #ffcc44; }
        70% { transform: scaleY(0.8); background: #fce588; }
      }

      @keyframes cth-flame2 {
        0%, 100% { transform: scaleY(1.2); background: #ffcc44; }
        30% { transform: scaleY(0.7); background: #fce588; }
        60% { transform: scaleY(1.6); background: #ffcc44; }
      }

      @keyframes cth-flame3 {
        0%, 100% { transform: scaleY(0.9); background: #fce588; }
        50% { transform: scaleY(1.4); background: #ffcc44; }
        80% { transform: scaleY(1.1); background: #fce588; }
      }

      .cth-bday-candles {
        display: flex;
        gap: 10px;
        margin-bottom: 0;
      }

      .cth-bday-candles span {
        width: 3px;
        height: 12px;
        background: #e8a0bf;
        border-radius: 1px;
      }

      .cth-bday-top {
        width: 48px;
        height: 14px;
        background: #f9c7d1;
        border-radius: 3px 3px 0 0;
        border-bottom: 3px solid #e8a0bf;
      }

      .cth-bday-base {
        width: 56px;
        height: 18px;
        background: #f5e6d0;
        border-radius: 0 0 4px 4px;
        border-top: 3px solid #e8d0b8;
      }

      .cth-bday-text {
        font-size: 13px;
        color: var(--cth-text);
        letter-spacing: 0.02em;
      }

      .cth-bday-date {
        font-size: 10px;
        color: var(--cth-text-subtle);
      }

      /* Responsive */
      @media (max-width: 700px) {
        .cth { flex-direction: column-reverse; padding: 16px; }
        .cth-years { flex-direction: row; flex-wrap: wrap; }
        .cth-header { flex-direction: column; }
        .cth-stats { justify-content: flex-start; }
        .cth-stat { align-items: flex-start; }
        :host { --cth-cell-s: 10px; --cth-cell-g: 2px; }
      }
    `;
  }
}

customElements.define('claude-token-heatmap', ClaudeTokenHeatmap);
