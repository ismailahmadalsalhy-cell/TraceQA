/**
 * report-theme.ts — the shared visual language for the two generated reports.
 *
 * DETERMINISTIC. No AI, no network. Both scripts/generate-dashboard.ts and
 * scripts/generate-report.ts inline what this module returns, so the dashboard
 * and the coverage matrix share one design system and can each render either
 * theme:
 *
 *   - "dark"      Ethereal Glass — OLED black, drifting aurora, vantablack glass,
 *                 Geist grotesk. (default)
 *   - "editorial" warm cream paper, espresso ink, high-contrast Fraunces serif
 *                 display, faint film grain.
 *
 * Selected with `--theme=editorial` on the generator's argv, or THEME=editorial
 * in the environment; anything else is "dark". The whole look is expressed as CSS
 * custom properties (tokens) over a shared component sheet, so switching a theme
 * is a token swap — not a second stylesheet to maintain.
 *
 * The fonts are base64-embedded (see geist-fonts.ts / fraunces-fonts.ts) so every
 * report still opens by double-click and renders with no internet connection.
 */
import { GEIST_SANS_WOFF2_B64, GEIST_MONO_WOFF2_B64 } from './geist-fonts.ts';
import { FRAUNCES_WOFF2_B64 } from './fraunces-fonts.ts';

export type Theme = 'dark' | 'editorial';

// Which of the two reports is being rendered. The pages share one creamy world
// but carry distinct identities so they can never be mistaken for each other:
//   - "matrix"    the formal traceability document — serif display, ink accent.
//   - "dashboard" the live operations view — grotesk display, warm clay accent.
export type Page = 'matrix' | 'dashboard';

// argv `--theme=` wins over the THEME env var (cross-platform: no shell needed).
// The soft-creamy "editorial" look is the default now; "dark" is opt-in.
export function resolveTheme(): Theme {
  const arg = process.argv.find((a) => a.startsWith('--theme='));
  const raw = (arg ? arg.slice('--theme='.length) : process.env.THEME ?? 'editorial').toLowerCase();
  return raw === 'dark' ? 'dark' : 'editorial';
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const b64 = (svg: string): string => Buffer.from(svg).toString('base64');

// ── Inline SVG assets (favicon per theme, one shared film-grain tile) ─────────
export function faviconUri(theme: Theme): string {
  const [bg, fg] = theme === 'editorial' ? ['#3b2f24', '#f7f2e8'] : ['#0a0c10', '#5fd99a'];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="8" fill="${bg}"/>` +
    `<path d="M8.6 16.7l4.6 4.6L23.4 11" fill="none" stroke="${fg}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${b64(svg)}`;
}

const GRAIN_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140">` +
  `<filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>` +
  `<feColorMatrix type="saturate" values="0"/></filter>` +
  `<rect width="100%" height="100%" filter="url(#g)"/></svg>`;
const GRAIN_URI = `data:image/svg+xml;base64,${b64(GRAIN_SVG)}`;

// Hand-rolled line icons (deliberately not a default icon set), one stroke weight.
export const ICONS = {
  check: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6.5 9.2 17.3 4 12.1"/></svg>',
  arrow: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7"/><path d="M9 7h8v8"/></svg>',
  block:
    '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/><path d="M6.1 6.1l11.8 11.8"/></svg>',
  gap: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.4" stroke-dasharray="2.6 3"/></svg>',
  flag: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4.4M6 4.4h11l-2.2 3.9L17 12H6"/></svg>',
} as const;

// ── @font-face — Geist always; Fraunces only when the editorial theme needs it ─
function fontFaces(theme: Theme): string {
  const geist = `
  @font-face { font-family: "Geist"; font-style: normal; font-weight: 100 900; font-display: swap; src: url(data:font/woff2;base64,${GEIST_SANS_WOFF2_B64}) format("woff2"); }
  @font-face { font-family: "Geist Mono"; font-style: normal; font-weight: 100 900; font-display: swap; src: url(data:font/woff2;base64,${GEIST_MONO_WOFF2_B64}) format("woff2"); }`;
  if (theme !== 'editorial') return geist;
  return (
    geist +
    `
  @font-face { font-family: "Fraunces"; font-style: normal; font-weight: 100 900; font-display: swap; src: url(data:font/woff2;base64,${FRAUNCES_WOFF2_B64}) format("woff2"); }`
  );
}

// ── Theme tokens — every value the shared component sheet reads through var() ──
function tokens(theme: Theme): string {
  if (theme === 'editorial') {
    // Soft-creamy: oat-milk paper, warm cocoa ink (never near-black), muted
    // pastel status hues, and warm diffuse shadows. Lower contrast than a stark
    // black-on-white doc — it should read like warm paper, not a screen.
    return `
    --bg: #f4eddf;
    --ink-0: #342a20; --ink-1: #4c4133; --ink-2: #786a58; --ink-3: #9d8f7a; --ink-4: #c6b8a1;
    --display: "Fraunces", Georgia, "Times New Roman", serif;
    --sans: "Geist", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --mono: "Geist Mono", ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace;

    --line: rgba(74,56,36,.10); --line-2: rgba(74,56,36,.17);
    --shell-bg: rgba(74,56,36,.045); --core-bg: #fdfaf2; --panel-bg: #fdfaf2; --tile-bg: rgba(74,56,36,.045);
    --glass-1: rgba(74,56,36,.045); --glass-2: rgba(74,56,36,.085);
    --inset: inset 0 1px 0 rgba(255,255,255,.65);
    --shadow-card: 0 26px 54px -38px rgba(74,56,36,.30), 0 7px 20px -14px rgba(74,56,36,.16);
    --shadow-soft: 0 18px 40px -30px rgba(74,56,36,.24);
    --dot-glow: none; --rate-glow: none;
    --code-bg: rgba(74,56,36,.06); --th-bg: rgba(74,56,36,.035); --row-hover: rgba(74,56,36,.03);
    --meter-track: rgba(74,56,36,.09); --meter-uncovered: rgba(74,56,36,.16);
    --grid-line: rgba(74,56,36,.16); --zebra: rgba(74,56,36,.038); --th-grid: #ede4d1;
    --nav-bg: rgba(253,250,242,.76); --nav-border: rgba(74,56,36,.14); --nav-shadow: 0 18px 40px -24px rgba(74,56,36,.4);
    --accent: #3b2f24; --accent-fg: #f7f2e8; --accent-grad: linear-gradient(180deg, #4a3b2d, #33281f); --accent-line: rgba(74,56,36,.5); --accent-ico: rgba(255,255,255,.14); --accent-ico-h: rgba(255,255,255,.22);
    --pill-active-bg: #3b2f24; --pill-active-fg: #f7f2e8;
    --focus: #5b8a4f; --spark: #7c6a52;
    --mark-bg: linear-gradient(180deg, #4a3b2d, #33281f); --mark-line: rgba(74,56,36,.4); --mark-ic: #f7f2e8;

    --pass-fg: #46703f; --pass-bg: #e8efdd; --pass-line: #cfe0bd; --pass-solid: #5f8d50;
    --fail-fg: #a84b3a; --fail-bg: #f4e4dd; --fail-line: #e6c5b9; --fail-solid: #bf5a43;
    --flaky-fg: #9a6f1f; --flaky-bg: #f4ecd4; --flaky-line: #e6d2a2; --flaky-solid: #c8922f;
    --amber-fg: #8c6c1c; --amber-bg: #f2ead0; --amber-line: #e0cf9c; --amber-solid: #bd9526;
    --blue-fg: #3f5984; --blue-bg: #e6ebf1; --blue-line: #c8d3e2; --blue-solid: #5c77a4;
    --suite-fg: #75516f; --suite-bg: #f0e7ef; --suite-line: #dcc8da;
    --grey-fg: #6e6051; --grey-bg: rgba(74,56,36,.06); --grey-line: rgba(74,56,36,.15);`;
  }
  return `
    --bg: #050505;
    --ink-0: #f3f5fa; --ink-1: #c6cdda; --ink-2: #929bac; --ink-3: #6b7484; --ink-4: #474e5c;
    --display: "Geist", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --sans: "Geist", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --mono: "Geist Mono", ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace;

    --line: rgba(255,255,255,.07); --line-2: rgba(255,255,255,.12);
    --shell-bg: rgba(255,255,255,.022); --core-bg: linear-gradient(180deg, #0d0f15, #0a0b10); --panel-bg: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.015)); --tile-bg: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.018));
    --glass-1: rgba(255,255,255,.04); --glass-2: rgba(255,255,255,.07);
    --inset: inset 0 1px 0 rgba(255,255,255,.06);
    --shadow-card: 0 30px 60px -45px rgba(0,0,0,.92);
    --shadow-soft: 0 24px 50px -40px rgba(0,0,0,.9);
    --dot-glow: 0 0 7px currentColor; --rate-glow: 0 0 12px rgba(62,194,122,.4);
    --code-bg: rgba(255,255,255,.04); --th-bg: rgba(255,255,255,.02); --row-hover: rgba(255,255,255,.025);
    --meter-track: rgba(255,255,255,.05); --meter-uncovered: rgba(255,255,255,.2);
    --grid-line: rgba(255,255,255,.10); --zebra: rgba(255,255,255,.022); --th-grid: rgba(255,255,255,.05);
    --nav-bg: rgba(11,13,18,.62); --nav-border: rgba(255,255,255,.12); --nav-shadow: 0 18px 44px -22px rgba(0,0,0,.92);
    --accent: #34c27a; --accent-fg: #04130b; --accent-grad: linear-gradient(180deg, #54d98e, #34c27a); --accent-line: rgba(62,194,122,.5); --accent-ico: rgba(4,19,11,.16); --accent-ico-h: rgba(4,19,11,.24);
    --pill-active-bg: #ffffff; --pill-active-fg: #0a0c10;
    --focus: rgba(95,217,154,.85); --spark: #5fd99a;
    --mark-bg: linear-gradient(180deg, rgba(62,194,122,.18), rgba(62,194,122,.05)); --mark-line: rgba(62,194,122,.28); --mark-ic: #5fd99a;

    --pass-fg: #6fdf9f; --pass-bg: rgba(62,194,122,.13); --pass-line: rgba(62,194,122,.30); --pass-solid: #34c27a;
    --fail-fg: #ff8079; --fail-bg: rgba(242,101,92,.13); --fail-line: rgba(242,101,92,.32); --fail-solid: #f2655c;
    --flaky-fg: #f3b061; --flaky-bg: rgba(232,149,57,.13); --flaky-line: rgba(232,149,57,.30); --flaky-solid: #e89539;
    --amber-fg: #f0c873; --amber-bg: rgba(220,174,60,.12); --amber-line: rgba(220,174,60,.28); --amber-solid: #dcae3c;
    --blue-fg: #86abff; --blue-bg: rgba(90,130,250,.14); --blue-line: rgba(90,130,250,.32); --blue-solid: #5a82fa;
    --suite-fg: #b7aaff; --suite-bg: rgba(139,123,240,.15); --suite-line: rgba(139,123,240,.32);
    --grey-fg: #929bac; --grey-bg: rgba(255,255,255,.05); --grey-line: rgba(255,255,255,.12);`;
}

// ── Shared component sheet — theme-agnostic, every surface read through var() ──
const COMPONENTS = `
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; font: 400 15px/1.6 var(--sans); color: var(--ink-1); background: var(--bg); overflow-x: hidden; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  a { color: inherit; text-decoration: none; }
  .tnum { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
  .muted { color: var(--ink-3); }
  .small { font-size: .82em; }
  code { font-family: var(--mono); font-size: .82em; background: var(--code-bg); border: 1px solid var(--line); padding: .08em .42em; border-radius: 6px; color: var(--ink-1); }
  .ic { width: 1em; height: 1em; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; flex: none; }

  /* Ambient background layers. */
  .aurora { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
  .orb { position: absolute; border-radius: 50%; will-change: transform; }
  .grain { position: fixed; inset: 0; z-index: 1; pointer-events: none; background-image: url("${GRAIN_URI}"); background-size: 150px; }
  main, footer { position: relative; z-index: 2; }

  /* Floating-island nav. */
  .topbar { position: fixed; top: 0; left: 0; right: 0; z-index: 100; display: flex; justify-content: center; padding: 0 1rem; pointer-events: none; }
  .nav-island { pointer-events: auto; margin-top: 18px; width: max-content; max-width: 100%; display: flex; align-items: center; gap: .4rem; padding: .45rem .5rem .45rem .7rem; border-radius: 999px; background: var(--nav-bg); border: 1px solid var(--nav-border); box-shadow: var(--inset), var(--nav-shadow); }
  .brand { display: flex; align-items: center; gap: .5rem; flex: none; padding: .1rem .3rem; }
  .brand-mark { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px; background: var(--mark-bg); border: 1px solid var(--mark-line); box-shadow: inset 0 1px 0 rgba(255,255,255,.12); }
  .brand-mark .ic { width: 15px; stroke: var(--mark-ic); stroke-width: 2.4; }
  .brand-name { color: var(--ink-0); font-family: var(--display); font-weight: 620; letter-spacing: -.01em; font-size: 1.02rem; }
  /* Page-identity chip — names the page (Matrix / Dashboard) in the page accent
     so the two reports are never mistaken for one another at a glance. */
  .nav-tag { flex: none; font-family: var(--mono); font-size: .58rem; font-weight: 600; text-transform: uppercase; letter-spacing: .14em; color: var(--accent-fg); background: var(--accent-grad); border: 1px solid var(--accent-line); padding: .26rem .5rem; border-radius: 7px; box-shadow: var(--inset); }
  .nav-div { width: 1px; height: 18px; background: var(--line-2); flex: none; }
  .nav-links { display: flex; align-items: center; gap: .1rem; }
  .nav-link { position: relative; white-space: nowrap; color: var(--ink-2); padding: .42rem .7rem; border-radius: 999px; font-size: .85rem; transition: color .3s cubic-bezier(.32,.72,0,1), background-color .3s cubic-bezier(.32,.72,0,1); }
  .nav-link:hover { color: var(--ink-0); background: var(--glass-1); }
  .nav-link.active { color: var(--ink-0); background: var(--glass-2); }
  .nav-health { flex: none; display: inline-flex; align-items: center; gap: .45rem; font-size: .8rem; font-weight: 560; color: var(--ink-2); padding: .32rem .72rem; border-radius: 999px; background: var(--glass-1); border: 1px solid var(--line); }
  .nav-health .dot { width: .5rem; height: .5rem; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px var(--glass-1), var(--dot-glow); }
  .nav-health.is-pass { color: var(--pass-fg); } .nav-health.is-fail { color: var(--fail-fg); } .nav-health.is-idle { color: var(--ink-3); }
  .nav-toggle { display: none; place-items: center; width: 38px; height: 38px; border-radius: 999px; border: 1px solid var(--line-2); background: var(--glass-1); cursor: pointer; transition: background-color .3s, border-color .3s; }
  .nav-toggle:hover { background: var(--glass-2); }
  .nav-bars { position: relative; width: 17px; height: 12px; display: block; }
  .nav-bars i { position: absolute; left: 0; right: 0; height: 1.6px; border-radius: 2px; background: var(--ink-0); transition: transform .5s cubic-bezier(.32,.72,0,1), top .4s cubic-bezier(.32,.72,0,1); }
  .nav-bars i:nth-child(1) { top: 2px; } .nav-bars i:nth-child(2) { top: 8px; }
  .nav-open .nav-bars i:nth-child(1) { top: 5px; transform: rotate(45deg); }
  .nav-open .nav-bars i:nth-child(2) { top: 5px; transform: rotate(-45deg); }

  .nav-overlay { position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; opacity: 0; visibility: hidden; transition: opacity .6s cubic-bezier(.32,.72,0,1), visibility .6s; }
  .nav-open .nav-overlay { opacity: 1; visibility: visible; }
  .nav-open { overflow: hidden; }
  .ov-nav { display: flex; flex-direction: column; gap: .3rem; padding: 2rem; width: min(560px, 92%); }
  .ov-link { display: flex; align-items: baseline; gap: 1rem; padding: .65rem .4rem; border-bottom: 1px solid var(--line); color: var(--ink-1); font-family: var(--display); font-size: clamp(1.6rem, 7vw, 2.3rem); font-weight: 580; letter-spacing: -.02em; transform: translateY(16px); opacity: 0; transition: transform .6s cubic-bezier(.32,.72,0,1), opacity .6s, color .3s; }
  .nav-open .ov-link { transform: none; opacity: 1; transition-delay: calc(var(--i) * 60ms + 120ms); }
  .ov-link:hover { color: var(--ink-0); }
  .ov-num { font-family: var(--mono); font-size: .8rem; color: var(--ink-3); font-weight: 500; }

  /* Layout & macro-whitespace. */
  main { max-width: 1140px; margin: 0 auto; padding: 116px clamp(1.1rem, 4vw, 2rem) 1rem; }
  section { scroll-margin-top: 104px; margin: 0 0 clamp(3rem, 7vw, 5.5rem); }
  .sec-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem 1.4rem; flex-wrap: wrap; margin-bottom: 1.4rem; }
  .sec-title { display: flex; align-items: center; gap: .7rem; }
  .kicker { font-family: var(--mono); font-size: .72rem; font-weight: 500; color: var(--ink-3); padding: .2rem .5rem; border: 1px solid var(--line-2); border-radius: 7px; background: var(--glass-1); }
  h2 { margin: 0; font-family: var(--display); font-size: 1.3rem; font-weight: 560; letter-spacing: -.02em; color: var(--ink-0); display: flex; align-items: baseline; gap: .5rem; }
  .sec-count { font-family: var(--mono); font-size: .78rem; font-weight: 500; color: var(--ink-3); background: var(--glass-1); border: 1px solid var(--line-2); border-radius: 999px; padding: .05rem .5rem; }

  /* Double-Bezel: outer shell (machined tray) + inner core (the surface). */
  .shell { background: var(--shell-bg); border: 1px solid var(--line); border-radius: 24px; padding: 7px; box-shadow: var(--shadow-card); }
  .core { position: relative; background: var(--core-bg); border: 1px solid var(--line); border-radius: 17px; box-shadow: var(--inset); overflow: hidden; }
  .table-wrap { overflow-x: auto; }

  /* Hero. */
  .hero { margin-bottom: clamp(3rem, 7vw, 5.5rem); }
  .hero-shell { border-radius: 34px; padding: 8px; }
  .hero-core { position: relative; overflow: hidden; border-radius: 26px; padding: clamp(1.6rem, 3.4vw, 2.6rem); background: var(--core-bg); }
  .hero-aura { position: absolute; inset: 0; pointer-events: none; }
  .hero-top { position: relative; display: flex; align-items: flex-start; justify-content: space-between; gap: 1.8rem 2.4rem; flex-wrap: wrap; }
  .hero-lead { flex: 1 1 280px; }
  .eyebrow { display: inline-flex; align-items: center; gap: .5rem; margin: 0 0 1.1rem; font-family: var(--sans); font-size: .7rem; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-2); padding: .32rem .7rem; border-radius: 999px; border: 1px solid var(--line-2); background: var(--glass-1); }
  .eyebrow-dot { width: .42rem; height: .42rem; border-radius: 50%; background: var(--spark); box-shadow: var(--dot-glow); }
  .figure { margin: 0; font-family: var(--display); font-size: clamp(3rem, 9vw, 5.2rem); font-weight: 600; line-height: .92; letter-spacing: -.045em; color: var(--ink-0); white-space: nowrap; }
  .figure .unit { font-size: .34em; font-weight: 560; color: var(--ink-2); margin-left: .18em; letter-spacing: 0; }
  .figure-sub { margin: 1rem 0 0; color: var(--ink-2); font-size: .98rem; max-width: 46ch; text-wrap: pretty; line-height: 1.5; }
  .hero-cta { display: flex; flex-wrap: wrap; gap: .7rem; margin-top: 1.7rem; }

  /* Island buttons — magnetic press + nested button-in-button trailing icon. */
  .btn { display: inline-flex; align-items: center; gap: .7rem; border-radius: 999px; font: inherit; font-weight: 550; font-size: .92rem; cursor: pointer; transition: transform .5s cubic-bezier(.32,.72,0,1), background-color .4s ease, border-color .4s ease, box-shadow .4s ease, color .3s ease; will-change: transform; }
  .btn:active { transform: scale(.975); }
  .btn-primary { color: var(--accent-fg); padding: .55rem .55rem .55rem 1.25rem; background: var(--accent-grad); border: 1px solid var(--accent-line); box-shadow: inset 0 1px 0 rgba(255,255,255,.32), 0 12px 32px -12px var(--accent-line); }
  .btn-primary:hover { box-shadow: inset 0 1px 0 rgba(255,255,255,.42), 0 16px 42px -12px var(--accent-line); }
  .btn-ico { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: 999px; background: var(--accent-ico); transition: transform .5s cubic-bezier(.32,.72,0,1), background-color .4s ease; }
  .btn-primary .btn-ico .ic { width: 1rem; stroke: var(--accent-fg); stroke-width: 2; }
  .group:hover .btn-ico { transform: translate(2px, -2px) scale(1.06); background: var(--accent-ico-h); }
  .btn-ghost { color: var(--ink-1); padding: .7rem 1.25rem; background: var(--glass-1); border: 1px solid var(--line-2); }
  .btn-ghost:hover { color: var(--ink-0); background: var(--glass-2); }

  .hero-stats { flex: 0 1 auto; min-width: min(100%, 340px); display: grid; grid-template-columns: repeat(3, minmax(82px, 1fr)); gap: .5rem; }
  .tile { padding: .7rem .8rem; border-radius: 14px; background: var(--tile-bg); border: 1px solid var(--line); box-shadow: var(--inset); }
  .tile-n { font-family: var(--display); font-size: 1.55rem; font-weight: 620; letter-spacing: -.02em; line-height: 1.05; color: var(--ink-0); }
  .tile-l { margin-top: .14rem; font-size: .67rem; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-2); }
  .tile-s { margin-top: .05rem; font-size: .72rem; color: var(--ink-3); }

  .meter { position: relative; display: flex; height: 13px; margin-top: 1.7rem; border-radius: 999px; overflow: hidden; background: var(--meter-track); box-shadow: inset 0 0 0 1px var(--line); }
  .seg { display: block; min-width: 3px; box-shadow: inset 0 1px 0 rgba(255,255,255,.16); }
  .seg + .seg { box-shadow: inset 0 1px 0 rgba(255,255,255,.16), inset 1px 0 0 rgba(0,0,0,.28); }
  .legend { display: flex; flex-wrap: wrap; gap: .4rem 1.2rem; margin-top: 1rem; }
  .legend .lg { display: inline-flex; align-items: center; gap: .45rem; font-size: .82rem; color: var(--ink-2); }
  .legend b { color: var(--ink-0); font-weight: 560; font-variant-numeric: tabular-nums; }
  .swatch { width: .62rem; height: .62rem; border-radius: 3px; flex: none; }
  .m-pass { background: var(--pass-solid); } .m-fail { background: var(--fail-solid); } .m-flaky { background: var(--flaky-solid); }
  .m-blocked { background: var(--blue-solid); } .m-skipped { background: var(--ink-4); } .m-notrun { background: var(--amber-solid); }
  .m-uncovered { background: var(--meter-uncovered); }

  /* Last run / key-value panel — single card. */
  .grid { display: flex; flex-wrap: wrap; gap: 1.4rem 2.4rem; align-items: center; padding: 1.3rem 1.5rem; background: var(--panel-bg); border: 1px solid var(--line); border-radius: 18px; box-shadow: var(--inset), var(--shadow-soft); }
  .kv .k { font-size: .66rem; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); }
  .kv .v { margin-top: .28rem; font-size: .95rem; color: var(--ink-0); font-variant-numeric: tabular-nums; }
  .kv .v code { font-size: .82rem; }
  .notice { background: var(--amber-bg); color: var(--amber-fg); border: 1px solid var(--amber-line); border-radius: 14px; padding: .9rem 1.2rem; font-weight: 560; }

  /* Filter controls. */
  .filterbar { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; }
  .filterbar .label { font-size: .68rem; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-3); margin-right: .15rem; }
  .pill { border: 1px solid var(--line-2); background: var(--glass-1); color: var(--ink-1); border-radius: 999px; padding: .3rem .8rem; font: inherit; font-size: .8rem; cursor: pointer; transition: border-color .3s cubic-bezier(.32,.72,0,1), background-color .3s cubic-bezier(.32,.72,0,1), color .3s ease, transform .1s ease; }
  .pill:hover { color: var(--ink-0); }
  .pill:active { transform: translateY(1px); }
  .pill.active { background: var(--pill-active-bg); color: var(--pill-active-fg); border-color: var(--pill-active-bg); }
  .req-filter { display: inline-flex; align-items: center; gap: .35rem; font-size: .8rem; color: var(--ink-2); }
  select { font: inherit; font-size: .8rem; padding: .3rem 1.7rem .3rem .6rem; border-radius: 9px; border: 1px solid var(--line-2); color: var(--ink-1); cursor: pointer; -webkit-appearance: none; appearance: none; background-color: var(--glass-1); background-repeat: no-repeat; background-position: right .6rem center; background-size: 10px 6px; }
  .clear-filters { border: 0; background: none; color: var(--ink-2); cursor: pointer; font: inherit; font-size: .8rem; padding: .3rem .4rem; border-radius: 6px; text-decoration: underline; text-underline-offset: 2px; transition: color .3s ease; }
  .clear-filters:hover { color: var(--ink-0); }

  /* Tables. */
  table { border-collapse: collapse; width: 100%; min-width: 560px; }
  th, td { text-align: left; padding: .8rem 1rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  thead th { background: var(--th-bg); font-size: .67rem; text-transform: uppercase; letter-spacing: .08em; font-weight: 600; color: var(--ink-3); border-bottom: 1px solid var(--line-2); }
  tbody tr { transition: background-color .25s cubic-bezier(.32,.72,0,1); }
  tbody tr:hover { background: var(--row-hover); }
  tbody tr:last-child td { border-bottom: 0; }
  td a { color: var(--ink-0); border-bottom: 1px solid transparent; transition: border-color .3s ease; }
  td a:hover { border-bottom-color: var(--line-2); }
  td code { white-space: nowrap; }
  td.notes { color: var(--ink-3); font-size: .85em; }

  /* Badges & dots — status carries a dot, tags don't. */
  .badge { display: inline-flex; align-items: center; gap: .42em; padding: .2em .62em; border-radius: 8px; font-size: .75rem; font-weight: 560; line-height: 1.35; border: 1px solid transparent; white-space: nowrap; }
  .badge .dot { width: .5em; height: .5em; border-radius: 50%; background: currentColor; flex: none; box-shadow: var(--dot-glow); }
  .b-pass, .s-documented { color: var(--pass-fg); background: var(--pass-bg); border-color: var(--pass-line); }
  .b-fail, .s-undocumented { color: var(--fail-fg); background: var(--fail-bg); border-color: var(--fail-line); }
  .b-flaky { color: var(--flaky-fg); background: var(--flaky-bg); border-color: var(--flaky-line); }
  .b-skipped, .b-uncovered { color: var(--grey-fg); background: var(--grey-bg); border-color: var(--grey-line); }
  .b-notrun, .b-no-results, .s-assumed { color: var(--amber-fg); background: var(--amber-bg); border-color: var(--amber-line); }
  .b-blocked { color: var(--blue-fg); background: var(--blue-bg); border-color: var(--blue-line); }
  .b-skipped .dot, .b-uncovered .dot { box-shadow: none; }
  .req-badge { font-family: var(--mono); font-size: .74rem; color: var(--ink-1); background: var(--glass-1); border-color: var(--line-2); }
  a.req-badge:hover { border-color: var(--line-2); color: var(--ink-0); }
  .suite-badge { color: var(--suite-fg); background: var(--suite-bg); border-color: var(--suite-line); }
  .pf { font-weight: 560; font-size: .8rem; font-variant-numeric: tabular-nums; margin-left: .1rem; }
  .pf-pass { color: var(--pass-fg); } .pf-fail { color: var(--fail-fg); } .pf-flaky { color: var(--flaky-fg); } .pf-skip { color: var(--ink-2); }

  /* Pass-rate meter (suites). */
  .rate { display: flex; align-items: center; gap: .7rem; min-width: 160px; }
  .rate-track { position: relative; flex: 1; height: 7px; border-radius: 999px; background: var(--meter-track); overflow: hidden; box-shadow: inset 0 0 0 1px var(--line); }
  .rate-fill { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: var(--pass-solid); box-shadow: var(--rate-glow); }
  .rate-n { min-width: 3ch; text-align: right; font-size: .78rem; font-weight: 560; color: var(--ink-1); }

  /* Needs attention. */
  .attn { background: var(--glass-1); border: 1px solid var(--line); border-left: 2px solid var(--line-2); border-radius: 16px; padding: 1.1rem 1.25rem; margin-bottom: .9rem; box-shadow: var(--inset); }
  .attn h3 { display: flex; align-items: center; gap: .55rem; margin: 0; font-size: .98rem; font-weight: 600; color: var(--ink-0); }
  .attn h3 .ic { width: 1.05rem; }
  .attn h3 .count { margin-left: .1rem; font-family: var(--mono); font-size: .74rem; font-weight: 500; background: var(--glass-2); color: var(--ink-2); border-radius: 999px; padding: .05rem .5rem; }
  .attn p { margin: .5rem 0 0; font-size: .86rem; }
  .attn ul { margin: .75rem 0 0; padding: 0; list-style: none; display: grid; gap: .35rem; }
  .attn li { position: relative; padding-left: 1.1rem; font-size: .9rem; color: var(--ink-1); }
  .attn li::before { content: ""; position: absolute; left: .2rem; top: .62em; width: 4px; height: 4px; border-radius: 50%; background: var(--ink-3); }
  .attn li code { font-size: .82rem; }
  .attn-blocked { border-left-color: var(--blue-solid); } .attn-blocked h3 .ic { color: var(--blue-fg); } .attn-blocked h3 .count { background: var(--blue-bg); color: var(--blue-fg); }
  .attn-uncovered { border-left-color: var(--ink-4); } .attn-uncovered h3 .ic { color: var(--ink-2); }
  .attn-assumed { border-left-color: var(--amber-solid); } .attn-assumed h3 .ic { color: var(--amber-fg); } .attn-assumed h3 .count { background: var(--amber-bg); color: var(--amber-fg); }
  .all-clear { display: flex; align-items: center; gap: .7rem; background: var(--pass-bg); color: var(--pass-fg); border: 1px solid var(--pass-line); border-radius: 16px; padding: 1.1rem 1.3rem; font-weight: 560; box-shadow: var(--inset); }
  .all-clear .ic { width: 1.2rem; }

  /* Focus & footer. */
  a:focus-visible, button:focus-visible, select:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 8px; }
  footer { max-width: 1140px; margin: 2rem auto 0; padding: 1.6rem clamp(1.1rem, 4vw, 2rem) 3rem; border-top: 1px solid var(--line); font-size: .8rem; line-height: 1.8; color: var(--ink-3); position: relative; z-index: 2; }
  footer code { font-size: .78rem; }
  .hidden { display: none !important; }

  /* Motion — scroll-reveal driven by IntersectionObserver, never a listener. */
  .reveal { transition: opacity .9s cubic-bezier(.22,.61,.36,1), transform .9s cubic-bezier(.22,.61,.36,1), filter .9s ease; }
  .will-reveal { opacity: 0; transform: translateY(26px); filter: blur(6px); will-change: opacity, transform; }
  .will-reveal.is-in { opacity: 1; transform: none; filter: none; }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    .reveal, .will-reveal, .will-reveal.is-in { opacity: 1 !important; transform: none !important; filter: none !important; transition: none !important; }
    .orb { animation: none !important; }
    .ov-link { transition: opacity .2s !important; transform: none !important; }
  }

  /* Responsive collapse. */
  @media (min-width: 921px) { .nav-overlay { display: none; } }
  @media (max-width: 920px) { .nav-links, .nav-div { display: none; } .nav-toggle { display: grid; } }
  @media (max-width: 720px) { .hero-stats { min-width: 100%; } main { padding-top: 104px; } }
  @media (max-width: 560px) { .hero-stats { grid-template-columns: repeat(2, 1fr); } .figure { font-size: clamp(2.6rem, 15vw, 3.4rem); } .nav-health { display: none; } h2 { font-size: 1.18rem; } }
`;

// ── Theme-specific chrome that can't be reduced to a token ────────────────────
function chrome(theme: Theme): string {
  if (theme === 'editorial') {
    return `
  body { background: radial-gradient(900px 520px at 100% -8%, rgba(190,150,90,.12), transparent 60%), radial-gradient(720px 460px at -6% 2%, rgba(150,120,80,.07), transparent 56%), var(--bg); }
  .aurora { display: none; }
  .grain { opacity: .06; mix-blend-mode: multiply; }
  .hero-aura { background: radial-gradient(680px 300px at 88% -45%, rgba(190,150,90,.20), transparent 68%); }
  .nav-island { backdrop-filter: blur(14px) saturate(120%); -webkit-backdrop-filter: blur(14px) saturate(120%); }
  .nav-overlay { background: rgba(250,247,240,.86); backdrop-filter: blur(24px) saturate(120%); -webkit-backdrop-filter: blur(24px) saturate(120%); }
  select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2390806e' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); }
  /* Fraunces wants the display optical cut and a touch less negative tracking than a grotesk. */
  .figure { font-variation-settings: "opsz" 140; font-weight: 560; letter-spacing: -.015em; }
  h2, .tile-n, .brand-name, .ov-link { font-variation-settings: "opsz" 96; }
  h2 { font-weight: 520; letter-spacing: -.01em; }
  .tile-n { font-weight: 540; letter-spacing: -.005em; }`;
  }
  return `
  .orb-a { width: 62vmax; height: 62vmax; top: -24vmax; right: -16vmax; background: radial-gradient(circle at 50% 50%, rgba(62,194,122,.18), rgba(62,194,122,.05) 40%, transparent 68%); animation: drift-a 28s cubic-bezier(.45,0,.55,1) infinite alternate; }
  .orb-b { width: 56vmax; height: 56vmax; bottom: -22vmax; left: -18vmax; background: radial-gradient(circle at 50% 50%, rgba(139,123,240,.16), rgba(139,123,240,.04) 42%, transparent 70%); animation: drift-b 34s cubic-bezier(.45,0,.55,1) infinite alternate; }
  @keyframes drift-a { to { transform: translate3d(-7vmax, 6vmax, 0) scale(1.08); } }
  @keyframes drift-b { to { transform: translate3d(6vmax, -5vmax, 0) scale(1.1); } }
  .grain { opacity: .05; mix-blend-mode: overlay; }
  .hero-aura { background: radial-gradient(680px 280px at 86% -40%, rgba(62,194,122,.16), transparent 68%), radial-gradient(520px 280px at 8% 120%, rgba(139,123,240,.12), transparent 70%); }
  .nav-island { backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%); }
  .nav-overlay { background: rgba(5,6,8,.82); backdrop-filter: blur(26px) saturate(140%); -webkit-backdrop-filter: blur(26px) saturate(140%); }
  select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23929bac' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); }`;
}

// ── Public composition helpers ────────────────────────────────────────────────
// ── Per-page identity — distinct accent + display family per report ───────────
// Same creamy paper, two characters: the matrix is an ink-on-cream printed
// document (serif), the dashboard is a warm, live application (grotesk). The
// dark theme keeps its single emerald accent for both pages (this only asks for
// distinct creamy identities), so page styling applies to the editorial look.
function pageStyle(theme: Theme, page?: Page): string {
  if (!page || theme !== 'editorial') return '';
  if (page === 'dashboard') {
    return `
  /* Dashboard — warm terracotta accent, grotesk display: reads as a live tool. */
  :root {
    --accent: #b0674a; --accent-fg: #fff7f0; --accent-grad: linear-gradient(180deg, #bd7656, #a85d3f);
    --accent-line: rgba(150,82,52,.5); --accent-ico: rgba(255,255,255,.18); --accent-ico-h: rgba(255,255,255,.26);
    --spark: #bb6f4d; --pill-active-bg: #b0674a; --pill-active-fg: #fff7f0;
    --mark-bg: linear-gradient(180deg, #bd7656, #a85d3f); --mark-line: rgba(150,82,52,.5); --mark-ic: #fff7f0;
    --focus: #b0674a;
    --display: var(--sans);
  }
  .figure, h2, .tile-n, .brand-name, .ov-link { font-variation-settings: normal; }
  .figure { font-weight: 660; letter-spacing: -.04em; }
  h2 { font-weight: 600; letter-spacing: -.022em; }
  .tile-n { font-weight: 640; letter-spacing: -.02em; }
  .hero-aura { background: radial-gradient(680px 300px at 88% -45%, rgba(176,103,74,.22), transparent 68%); }`;
  }
  // matrix — keep the ink accent (≈ editorial default) but warm the aura.
  return `
  /* Matrix — espresso ink accent, Fraunces serif: a formal printed record. */
  :root { --spark: #7c6a52; --focus: #5b8a4f; }
  .hero-aura { background: radial-gradient(700px 320px at 86% -50%, rgba(120,96,66,.15), transparent 70%); }`;
}

/** The full inner CSS for `<style>…</style>` — fonts, tokens, components, chrome. */
export function themeStyle(theme: Theme, page?: Page): string {
  return `${fontFaces(theme)}\n  :root {${tokens(theme)}\n  }\n${COMPONENTS}${chrome(theme)}${pageStyle(theme, page)}`;
}

/** Background-chrome markup for the top of <body> (aurora orbs only in dark). */
export function backdrop(theme: Theme): string {
  const orbs = theme === 'dark' ? '<span class="orb orb-a"></span><span class="orb orb-b"></span>' : '';
  return `  <div class="aurora" aria-hidden="true">${orbs}</div>
  <div class="grain" aria-hidden="true"></div>`;
}

/** The floating-island nav + its mobile overlay. `items` = [anchorId, label][].
 *  `tag` names the page (e.g. "Matrix" / "Dashboard") in the page accent. */
export function floatingNav(opts: {
  items: ReadonlyArray<readonly [string, string]>;
  health: string;
  brandHref?: string;
  tag?: string;
}): string {
  const brandHref = opts.brandHref ?? '#summary';
  const desktop = opts.items.map(([id, label]) => `<a class="nav-link" href="#${id}">${esc(label)}</a>`).join('');
  const overlay = opts.items
    .map(
      ([id, label], i) =>
        `<a class="ov-link" href="#${id}" style="--i:${i}"><span class="ov-num tnum">${String(i + 1).padStart(
          2,
          '0',
        )}</span><span>${esc(label)}</span></a>`,
    )
    .join('');
  const tag = opts.tag ? `<span class="nav-tag" aria-hidden="true">${esc(opts.tag)}</span>` : '';
  return `  <header class="topbar">
    <div class="nav-island">
      <a class="brand" href="${esc(brandHref)}" aria-label="TraceQA — back to top">
        <span class="brand-mark" aria-hidden="true">${ICONS.check}</span>
        <span class="brand-name">TraceQA</span>
      </a>
      ${tag}
      <span class="nav-div" aria-hidden="true"></span>
      <nav class="nav-links" aria-label="Sections">${desktop}</nav>
      ${opts.health}
      <button class="nav-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="nav-overlay">
        <span class="nav-bars" aria-hidden="true"><i></i><i></i></span>
      </button>
    </div>
  </header>

  <div class="nav-overlay" id="nav-overlay" aria-hidden="true">
    <nav class="ov-nav" aria-label="Sections">${overlay}</nav>
  </div>`;
}

/** Shared motion: IntersectionObserver scroll-reveal + scroll-spy + island nav. */
export function motionScript(): string {
  return `<script>
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Scroll-reveal — IntersectionObserver, never a scroll listener. No-JS and
  // reduced-motion show everything immediately (we only hide once we can animate).
  var reveals = document.querySelectorAll('.reveal');
  if (!reduce && 'IntersectionObserver' in window) {
    for (var i = 0; i < reveals.length; i++) reveals[i].classList.add('will-reveal');
    var revObs = new IntersectionObserver(function (entries) {
      for (var j = 0; j < entries.length; j++) {
        if (entries[j].isIntersecting) { entries[j].target.classList.add('is-in'); revObs.unobserve(entries[j].target); }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    for (var k = 0; k < reveals.length; k++) revObs.observe(reveals[k]);
  }

  // Scroll-spy — light the nav link whose section owns the viewport mid-band.
  var linkById = {};
  var navlinks = document.querySelectorAll('.nav-link');
  for (var n = 0; n < navlinks.length; n++) linkById[navlinks[n].getAttribute('href').slice(1)] = navlinks[n];
  var sections = document.querySelectorAll('main section[id]');
  if ('IntersectionObserver' in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      for (var a = 0; a < entries.length; a++) {
        if (!entries[a].isIntersecting) continue;
        var id = entries[a].target.id;
        for (var key in linkById) linkById[key].classList.toggle('active', key === id);
      }
    }, { rootMargin: '-46% 0px -50% 0px', threshold: 0 });
    for (var s = 0; s < sections.length; s++) spy.observe(sections[s]);
  }

  // Fluid-island nav — hamburger morphs to X, opens a full-screen glass overlay.
  var toggle = document.querySelector('.nav-toggle');
  var body = document.body;
  function setNav(open) { body.classList.toggle('nav-open', open); if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  if (toggle) toggle.addEventListener('click', function () { setNav(!body.classList.contains('nav-open')); });
  var ovLinks = document.querySelectorAll('.ov-link');
  for (var o = 0; o < ovLinks.length; o++) ovLinks[o].addEventListener('click', function () { setNav(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });
})();
</script>`;
}
