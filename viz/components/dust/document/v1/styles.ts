export const DOCUMENT_STYLES = `
  .dust-document, .dust-document-popup {
    --doc-ink: var(--foreground, var(--color-foreground, #292524));
    --doc-muted: var(--muted-foreground, var(--color-muted-foreground, #78716c));
    --doc-border: var(--border, var(--color-border, #e7e5e4));
    --doc-surface: var(--popover, var(--color-overlay-background, #fff));
    --doc-paper: var(--background, var(--color-background, #fff));
    --doc-hover: color-mix(in srgb, var(--doc-ink) 5%, var(--doc-surface));
    --doc-active: color-mix(in srgb, var(--doc-ink) 10%, var(--doc-surface));
    --doc-focus: var(--ring, var(--color-border-focus, #a8a29e));
    color: var(--doc-ink);
    font-family: var(--font-geist, Geist, ui-sans-serif, system-ui, sans-serif);
    -webkit-font-smoothing: antialiased;
  }
  .dust-document { box-sizing: border-box; margin: 0 auto; max-width: 50rem; padding: clamp(2rem, 6vw, 4.5rem) clamp(1.25rem, 5vw, 3rem) 4rem; }
  .dust-document:has(.dust-document-save) { padding-top: clamp(1.25rem, 3vw, 2rem); }
  .dust-document-body { min-height: 24rem; outline: none; font-size: 1rem; line-height: 1.75; overflow-wrap: anywhere; caret-color: var(--doc-ink); }
  .dust-document-body > :first-child { margin-top: 0; }
  .dust-document-body h1, .dust-document-body h2, .dust-document-body h3 { font-weight: 600; letter-spacing: -.025em; text-wrap: pretty; }
  .dust-document-body h1 { font-size: 2rem; line-height: 1.25; margin: 2.25rem 0 .75rem; }
  .dust-document-body > h1:first-child { font-size: 2.5rem; line-height: 1.15; font-weight: 650; letter-spacing: -.035em; margin-bottom: 1.5rem; }
  .dust-document-body h2 { font-size: 1.75rem; line-height: 1.3; margin: 2rem 0 .75rem; }
  .dust-document-body h3 { font-size: 1.375rem; line-height: 1.35; margin: 1.75rem 0 .5rem; }
  .dust-document-body p { margin: .65rem 0; }
  .dust-document-body strong { font-weight: 600; }
  .dust-document-body ul, .dust-document-body ol { padding-left: 1.5rem; margin: .75rem 0; }
  .dust-document-body ul { list-style: disc; }
  .dust-document-body ol { list-style: decimal; }
  .dust-document-body li { padding-left: .25rem; }
  .dust-document-body li p { margin: .25rem 0; }
  .dust-document-body li::marker { color: var(--doc-muted); font-variant-numeric: tabular-nums; }
  .dust-document-body li > ul, .dust-document-body li > ol { margin: .25rem 0; }
  .dust-document-body blockquote { margin: 1.5rem 0; border-left: 2px solid color-mix(in srgb, var(--doc-ink) 30%, var(--doc-paper)); padding: .1rem 1rem; color: color-mix(in srgb, var(--doc-ink) 85%, var(--doc-paper)); }
  .dust-document-body blockquote p { margin: .25rem 0; }
  .dust-document-body pre { margin: 1.5rem 0; white-space: pre; overflow-x: auto; background: var(--doc-hover); border: 1px solid var(--doc-border); padding: 1rem 1.25rem; border-radius: .625rem; font-size: .875rem; line-height: 1.65; tab-size: 2; }
  .dust-document-body code { font-family: var(--font-geist-mono, "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace); }
  .dust-document-body :not(pre) > code { background: var(--doc-hover); border: 1px solid var(--doc-border); border-radius: .3rem; padding: .1rem .3rem; font-size: .85em; }
  .dust-document-body a { color: inherit; text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--doc-ink) 35%, transparent); text-underline-offset: .22em; transition: text-decoration-color 120ms; }
  .dust-document-body a:hover { text-decoration-color: currentColor; }
  .dust-document-body hr { margin: 2rem 0; border: 0; border-top: 1px solid var(--doc-border); }
  .dust-document-body .is-empty::before { content: attr(data-placeholder); color: var(--doc-muted); font-weight: 400; float: left; height: 0; pointer-events: none; }
  .dust-document-body h1.is-empty::before { color: color-mix(in srgb, var(--doc-ink) 35%, var(--doc-paper)); font-weight: inherit; }
  .dust-document-save { min-height: 1.5rem; display: flex; align-items: center; justify-content: flex-end; gap: .65rem; margin-bottom: 1.5rem; font-size: .75rem; line-height: 1.5; color: var(--doc-muted); }
  .dust-document-save [role="status"] { display: inline-flex; align-items: center; gap: .375rem; }
  .dust-document-pending { width: .3rem; height: .3rem; margin: 0 .3rem; border-radius: 50%; background: currentColor; }
  .dust-document-spinner { animation: dust-document-spin 1.2s linear infinite; }
  .dust-document-save button { cursor: pointer; border: 1px solid var(--doc-border); color: var(--doc-ink); background: var(--doc-surface); border-radius: .35rem; padding: .15rem .5rem; font: inherit; transition: background 120ms; }
  .dust-document-save button:hover { background: var(--doc-hover); }
  .dust-document-save[data-state="error"] { color: var(--doc-ink); }
  .dust-document-save[data-state="error"] svg { color: var(--destructive, var(--color-warning, #b45309)); }
  .dust-document-error { border: 1px solid var(--doc-border); border-radius: .5rem; padding: .75rem 1rem; background: var(--doc-hover); color: var(--doc-ink); font-size: .8125rem; margin: -.5rem 0 1.5rem; line-height: 1.6; }
  .dust-document-popup { position: relative; z-index: 50; }
  .dust-document-selection, .dust-document-blocks { color: var(--doc-ink); background: var(--doc-surface); border: 1px solid var(--doc-border); box-shadow: 0 12px 32px -8px #00000020, 0 2px 8px #0000000a; }
  .dust-document-tooltip { display: flex; align-items: center; gap: .75rem; border: 1px solid var(--doc-border); background: var(--doc-surface); border-radius: .375rem; padding: .375rem .625rem; box-shadow: 0 4px 12px #00000012; font-size: .75rem; line-height: 1.5; z-index: 60; }
  .dust-document-tooltip kbd { color: var(--doc-muted); font: inherit; font-size: .6875rem; }
  .dust-document-selection { display: flex; align-items: center; gap: .125rem; padding: .25rem; border-radius: .625rem; }
  .dust-document-selection button { display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; cursor: pointer; color: var(--doc-muted); background: transparent; border: 1px solid transparent; border-radius: .375rem; transition: color 120ms, background 120ms, border-color 120ms; }
  .dust-document-selection button:hover { background: var(--doc-hover); color: var(--doc-ink); }
  .dust-document-selection button[aria-pressed="true"] { background: var(--doc-active); color: var(--doc-ink); border-color: color-mix(in srgb, var(--doc-ink) 12%, transparent); }
  .dust-document-selection button[data-format="code"] { margin-left: .3rem; position: relative; }
  .dust-document-selection button[data-format="code"]::before { content: ""; position: absolute; left: -.3rem; height: 1rem; width: 1px; background: var(--doc-border); }
  .dust-document-save button:focus-visible, .dust-document-selection button:focus-visible, .dust-document-blocks button:focus-visible { outline: 2px solid var(--doc-focus); outline-offset: 2px; }
  .dust-document-blocks { width: 18.5rem; max-width: calc(100vw - 2rem); padding: .375rem; border-radius: .75rem; }
  .dust-document-blocks:not([hidden]) { animation: dust-document-menu-in 120ms ease-out; }
  .dust-document-blocks-label { padding: .4rem .625rem .5rem; color: var(--doc-muted); font-size: .6875rem; font-weight: 500; line-height: 1.5; }
  .dust-document-blocks-list { max-height: min(22rem, 55vh); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--doc-border) transparent; }
  .dust-document-blocks button { display: flex; align-items: center; gap: .625rem; width: 100%; min-height: 3.25rem; border: 0; border-radius: .4375rem; padding: .5rem .625rem; background: transparent; color: inherit; text-align: left; cursor: pointer; font: inherit; }
  .dust-document-blocks button[data-active="true"] { background: var(--doc-hover); }
  .dust-document-block-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 2rem; height: 2rem; color: var(--doc-muted); background: var(--doc-paper); border: 1px solid var(--doc-border); border-radius: .375rem; }
  .dust-document-blocks button[data-active="true"] .dust-document-block-icon { color: var(--doc-ink); }
  .dust-document-block-name { display: block; font-size: .875rem; font-weight: 500; line-height: 1.4; }
  .dust-document-block-description { display: block; color: var(--doc-muted); font-size: .75rem; line-height: 1.4; margin-top: .0625rem; }
  .dust-document-block-enter { flex-shrink: 0; margin-left: auto; color: var(--doc-muted); visibility: hidden; }
  .dust-document-blocks button[data-active="true"] .dust-document-block-enter { visibility: visible; }
  .dust-document-blocks-empty { padding: 1.5rem .625rem; font-size: .8125rem; color: var(--doc-muted); }
  .dust-document-blocks-hint { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--doc-border); margin-top: .375rem; padding: .625rem .625rem .25rem; font-size: .6875rem; color: var(--doc-muted); }
  .dust-document-blocks-hint span { display: inline-flex; align-items: center; gap: .2rem; }
  .dust-document-blocks-hint kbd { min-width: .875rem; padding: 0 .1rem; text-align: center; font: inherit; line-height: 1.3; border: 1px solid var(--doc-border); border-radius: .1875rem; }
  @keyframes dust-document-spin { to { transform: rotate(360deg); } }
  @keyframes dust-document-menu-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
  @media (max-width: 480px) { .dust-document-body > h1:first-child { font-size: 2rem; } .dust-document-body h2 { font-size: 1.5rem; } .dust-document-body h3 { font-size: 1.25rem; } .dust-document-save { margin-bottom: 1.25rem; } }
  @media (prefers-reduced-motion: reduce) { .dust-document-spinner, .dust-document-blocks:not([hidden]) { animation: none; } .dust-document-selection button, .dust-document-save button, .dust-document-body a { transition: none; } }
  @media print { .dust-document, .dust-document:has(.dust-document-save) { max-width: none; padding: 0; } .dust-document-save, .dust-document-error, .dust-document-popup, .dust-document-body .is-empty::before { display: none; } }
`;
