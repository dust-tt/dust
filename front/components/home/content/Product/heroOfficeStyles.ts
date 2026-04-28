// Scoped CSS for the home-page hero floor scene. Variables and keyframes
// are namespaced inside .dust-floor-host so they do not leak into the rest
// of the site.

export const SCENE_CSS = `
.dust-floor-host {
  --gray-50:  #F7F7F7;
  --gray-100: #EEEEEF;
  --gray-150: #DFE0E2;
  --gray-200: #D3D5D9;
  --gray-700: #364153;
  --gray-800: #2A3241;
  --gray-900: #1C222D;
  --gray-950: #111418;
  --blue-200: #9FDBFF;
  --blue-400: #4BABFF;
  --blue-500: #1C91FF;
  --green-200: #E2F78C;
  --font-sans: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.dust-floor-host .floor-svg {
  width: 100%;
  height: 100%;
  max-height: 100vh;
  display: block;
  pointer-events: auto;
}

/* HTML overlay for chat cards. Anchored absolutely on top of the SVG so
   cards render at real CSS px (no foreignObject viewBox scaling). */
.dust-floor-host .dust-floor-cards {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}
.dust-floor-host .dust-floor-card-anchor {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  pointer-events: none;
  /* transform is set per rAF by the engine to follow the speaker. */
}
.dust-floor-host .dust-floor-card-anchor .chat-card {
  position: absolute;
  left: 0;
  bottom: 24px; /* sit 24px above the speaker's avatar center */
  transform: translateX(-50%);
  transform-origin: 50% 100%;
}

/* ---------------- Floor plan pieces ---------------- */
.dust-floor-host .room-label {
  font: 600 12px/1 var(--font-sans); letter-spacing: -0.2px;
  fill: var(--gray-900); text-transform: none;
}
.dust-floor-host .room-count {
  font: 500 9.5px/1 var(--font-mono); letter-spacing: 0.02em;
  fill: #596170;
}
.dust-floor-host .room-rect {
  fill: #FFFFFF; stroke: var(--gray-200); stroke-width: 1.5;
}
.dust-floor-host .room-chip { stroke: rgba(17,20,24,0.06); stroke-width: 0.8; }
.dust-floor-host .room-divider { stroke: var(--gray-150); stroke-width: 1; }
.dust-floor-host .room-pill-bg {
  fill: var(--gray-50); stroke: var(--gray-150); stroke-width: 0.8;
}
.dust-floor-host .corridor {
  fill: #FAFAFA; stroke: var(--gray-150); stroke-width: 1; stroke-dasharray: 3 4;
}
.dust-floor-host .door { stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; }
.dust-floor-host .wall-shadow { fill: rgba(17,20,24,0.04); }
.dust-floor-host .desk { fill: var(--gray-100); stroke: var(--gray-200); stroke-width: 1; rx: 3; }
.dust-floor-host .chair { fill: var(--gray-200); }
.dust-floor-host .plant { fill: var(--green-200); }

/* Humans */
.dust-floor-host .human { transform-box: fill-box; transform-origin: center; }
.dust-floor-host .human-body {
  animation: dust-floor-human-bob 3.6s ease-in-out infinite;
  transform-box: fill-box; transform-origin: 50% 50%;
}
@keyframes dust-floor-human-bob {
  0%,100% { transform: translateY(0) scale(1); }
  50%     { transform: translateY(-0.8px) scale(1.03); }
}
.dust-floor-host .human.sway .human-body { animation-duration: 4.8s; animation-name: dust-floor-human-bob; }

.dust-floor-host .status-dot { stroke: #FFFFFF; stroke-width: 1.5; }
.dust-floor-host .status-online { fill: #3BA55D; }
.dust-floor-host .status-idle   { fill: #FAA81A; }
.dust-floor-host .status-busy   { fill: #ED4245; }
.dust-floor-host .status-online-pulse {
  animation: dust-floor-status-pulse 2.4s ease-out infinite;
  transform-box: fill-box; transform-origin: 50% 50%;
}
@keyframes dust-floor-status-pulse {
  0%   { opacity: .5; transform: scale(1); }
  70%  { opacity: 0;  transform: scale(2.6); }
  100% { opacity: 0;  transform: scale(2.6); }
}

.dust-floor-host .activity-emoji { transform-box: fill-box; transform-origin: 50% 50%; }
.dust-floor-host .activity-emoji.pop { animation: dust-floor-emoji-pop 420ms cubic-bezier(.2,.8,.2,1); }
@keyframes dust-floor-emoji-pop {
  0%   { transform: scale(0.4); opacity: 0; }
  60%  { transform: scale(1.25); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

/* AI agents */
.dust-floor-host .agent {
  transform: translate(var(--x, 0px), var(--y, 0px));
}
.dust-floor-host .agent-body {
  transform-box: fill-box; transform-origin: 50% 50%;
  animation: dust-floor-agent-pulse 4.6s ease-in-out infinite;
}
@keyframes dust-floor-agent-pulse {
  0%,100% { transform: scale(1); }
  50%     { transform: scale(1.03); }
}
/* Halo is hidden by default. Same .active rule as the @name chip: only
   the agents in the running scenario radiate. */
.dust-floor-host .agent-halo {
  transform-box: fill-box; transform-origin: 50% 50%;
  opacity: 0;
  transition: opacity 220ms ease;
}
.dust-floor-host .agent.active .agent-halo {
  animation: dust-floor-halo 4.6s ease-in-out infinite;
}
@keyframes dust-floor-halo {
  0%,100% { opacity: .28; transform: scale(1); }
  50%     { opacity: .12; transform: scale(1.4); }
}
.dust-floor-host .agent-trail {
  stroke-dasharray: 2 4;
  animation: dust-floor-trail-dash 1.2s linear infinite;
}
@keyframes dust-floor-trail-dash {
  to { stroke-dashoffset: -12; }
}
.dust-floor-host .agent.active.working .agent-halo {
  animation: dust-floor-halo-working 3.4s ease-in-out infinite;
}
@keyframes dust-floor-halo-working {
  0%,100% { opacity: .34; transform: scale(1.05); }
  50%     { opacity: .14; transform: scale(1.6); }
}
.dust-floor-host .agent-spark {
  transform-box: fill-box; transform-origin: 50% 50%;
  animation: dust-floor-spark-rotate 6s linear infinite;
}
@keyframes dust-floor-spark-rotate { to { transform: rotate(360deg); } }

/* Agent @name chip is hidden by default; the engine adds .active to
   agents that belong to the currently-running scenario, so idle agents
   from other scenarios stay quiet in the office. */
.dust-floor-host .agent-tag {
  opacity: 0;
  transition: opacity 220ms ease;
  pointer-events: none;
}
.dust-floor-host .agent.active .agent-tag {
  opacity: 1;
}
.dust-floor-host .agent-tag rect {
  transition: fill 180ms ease, stroke 180ms ease, x 260ms cubic-bezier(.2,.8,.2,1), width 260ms cubic-bezier(.2,.8,.2,1);
  fill: #FFFFFF;
  stroke: var(--gray-200);
}
.dust-floor-host .agent-tag text {
  font: 600 18px/1 var(--font-mono);
  letter-spacing: 0;
  fill: var(--gray-800);
  transition: fill 180ms ease;
}
.dust-floor-host .agent.talking .agent-tag rect {
  fill: #111418; stroke: #111418;
  filter: drop-shadow(0 3px 10px rgba(17,20,24,0.25));
}
.dust-floor-host .agent.talking .agent-tag text {
  fill: #FFFFFF;
  font: 500 20px/1.35 var(--font-sans);
  letter-spacing: -0.2px;
}
.dust-floor-host .person-bubble text {
  font: 500 20px/1.35 var(--font-sans);
  letter-spacing: -0.2px;
}

/* Chat cards (HTML overlay, real CSS px) */
.dust-floor-host .chat-card {
  box-sizing: border-box;
  background: #FDFCF7;
  border: 1px solid rgba(17,20,24,0.08);
  border-radius: 18px;
  padding: 14px 18px 12px;
  font-family: var(--font-sans);
  color: #1A1D21;
  box-shadow: 0 12px 32px -10px rgba(17,20,24,0.22), 0 2px 6px rgba(17,20,24,0.08);
  opacity: 1;
  position: relative;
}
.dust-floor-host .chat-card::after {
  content: "";
  position: absolute;
  left: 50%; bottom: -9px;
  width: 16px; height: 16px;
  transform: translateX(-50%) rotate(45deg);
  background: #FDFCF7;
  border-right: 1px solid rgba(17,20,24,0.08);
  border-bottom: 1px solid rgba(17,20,24,0.08);
  border-bottom-right-radius: 4px;
}
.dust-floor-host .chat-card.agent-card::after {
  border-right-color: rgba(28,145,255,0.22);
  border-bottom-color: rgba(28,145,255,0.22);
}
.dust-floor-host .chat-card.visible { opacity: 1; }
.dust-floor-host .chat-card.fade-out { opacity: 0; transition: opacity 220ms ease; }
.dust-floor-host .chat-card.agent-card {
  background: #FDFCF7;
  border-color: rgba(28,145,255,0.22);
}
.dust-floor-host .chat-card-header {
  display: flex; align-items: flex-start; gap: 10px;
  margin-bottom: 10px;
}
.dust-floor-host .chat-card-avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background-color: #E9ECEF;
  flex-shrink: 0;
  border: 1.5px solid rgba(17,20,24,0.06);
  overflow: hidden;
}
.dust-floor-host .chat-card-avatar img {
  width: 100%; height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
  border-radius: 50%;
}
.dust-floor-host .chat-card-avatar.agent-avatar {
  background: #1C91FF;
  display: flex; align-items: center; justify-content: center;
  border-color: rgba(28,145,255,0.35);
}
.dust-floor-host .chat-card-avatar.agent-avatar svg { width: 18px; height: 18px; }
.dust-floor-host .chat-card-meta {
  display: flex; flex-direction: column;
  line-height: 1.15; gap: 2px; min-width: 0;
}
.dust-floor-host .chat-card-name {
  font: 600 14px/1.2 var(--font-sans); letter-spacing: -0.2px; color: #1A1D21;
}
.dust-floor-host .chat-card-role {
  font: 400 11px/1.2 var(--font-sans); color: #6A7078; letter-spacing: -0.1px;
}
.dust-floor-host .chat-card-role .dot { margin: 0 5px; opacity: 0.5; }
.dust-floor-host .chat-card-body {
  font: 400 13px/1.5 var(--font-sans); letter-spacing: -0.1px; color: #1A1D21;
  white-space: pre-wrap; word-break: break-word;
}
.dust-floor-host .chat-card-body strong { font-weight: 600; }
.dust-floor-host .chat-card-body .mention {
  display: inline-block;
  padding: 0 5px; margin: 0 1px;
  background: rgba(28,145,255,0.14); color: #0F5CB3;
  border-radius: 5px; font-weight: 500;
}
.dust-floor-host .chat-card-body .mention.agent-mention {
  background: rgba(17,20,24,0.08); color: #1A1D21;
}
.dust-floor-host[data-paused="true"],
.dust-floor-host[data-paused="true"] *,
.dust-floor-host[data-paused="true"] *::before,
.dust-floor-host[data-paused="true"] *::after {
  animation-play-state: paused !important;
}
.dust-floor-host .chat-card-body .tool-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 0 6px; margin: 0 1px;
  background: #F1F4F8; color: #1A1D21;
  border: 1px solid rgba(17,20,24,0.06);
  border-radius: 5px; font-weight: 500;
  white-space: nowrap;
  vertical-align: -2px;
}
.dust-floor-host .chat-card-body .tool-chip.tool-chip-logo {
  padding: 0 2px; gap: 5px;
  background: transparent; border: none;
}
.dust-floor-host .chat-card-body .tool-chip.tool-chip-logo img {
  display: block;
  width: 1.05em; height: 1.05em;
  object-fit: contain;
}
.dust-floor-host .chat-card-body ul {
  list-style: none; padding: 2px 0; margin: 6px 0 0;
}
.dust-floor-host .chat-card-body ul li {
  position: relative; padding-left: 12px; margin: 5px 0; line-height: 1.4;
}
.dust-floor-host .chat-card-body ul li::before {
  content: ""; position: absolute; left: 2px; top: 8px;
  width: 4px; height: 4px; border-radius: 50%; background: #6A7078;
}
.dust-floor-host .chat-card-body .closer { margin-top: 9px; }
.dust-floor-host .chat-card-caret {
  display: inline-block;
  width: 6px; height: 1em; background: #1A1D21;
  vertical-align: -2px; margin-left: 1px;
  animation: dust-floor-caret-blink 0.9s steps(2,start) infinite;
}
.dust-floor-host .chat-card-reactions {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px;
}
.dust-floor-host .chat-card-reactions:empty { display: none; }
.dust-floor-host .chat-card-reactions .react-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px 3px 8px;
  background: #FFFFFF;
  border: 1px solid rgba(17,20,24,0.1);
  border-radius: 999px;
  font: 600 12px/1 var(--font-sans);
  color: #1A1D21; letter-spacing: -0.1px;
  animation: dust-floor-pill-pop 220ms cubic-bezier(0.34, 1.4, 0.64, 1);
  transform-origin: center;
  will-change: transform;
}
.dust-floor-host .chat-card-reactions .react-pill .em { font-size: 14px; line-height: 1; }
.dust-floor-host .chat-card-reactions .react-pill .count { color: #4A5058; font-weight: 600; }

.dust-floor-host .reaction-pill rect {
  fill: #FFFFFF;
  stroke: rgba(17,20,24,0.12);
  stroke-width: 1;
  filter: drop-shadow(0 2px 5px rgba(17,20,24,0.12));
}
.dust-floor-host .reaction-pill.agent-pill rect { fill: #1C222D; stroke: #1C222D; }
.dust-floor-host .reaction-pill.agent-pill text { fill: #FFFFFF; }
.dust-floor-host .reaction-pill text {
  font: 600 14px/1 var(--font-sans);
  fill: var(--gray-900);
  letter-spacing: -0.1px;
}
.dust-floor-host .reaction-pill .em { font-size: 16px; }
.dust-floor-host .reaction-pill {
  transform-box: fill-box; transform-origin: center;
  animation: dust-floor-pill-pop 220ms cubic-bezier(0.34, 1.4, 0.64, 1);
}
@keyframes dust-floor-pill-pop {
  0%   { transform: scale(0.85); opacity: 0; }
  60%  { transform: scale(1.04); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

/* Flying emoji — appended to document.body. Motion is driven by transform
   only (left/top are static anchors set on creation) so the path stays on
   the GPU compositor. */
.dust-floor-fly-emoji {
  position: absolute;
  font-size: 26px; line-height: 1;
  pointer-events: none;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 2px 6px rgba(17,20,24,0.25));
  will-change: transform, opacity;
}

.dust-floor-host .agent-tag .caret {
  fill: #FFFFFF;
  animation: dust-floor-caret-blink 0.9s steps(2, start) infinite;
}
@keyframes dust-floor-caret-blink { 50% { opacity: 0; } }

.dust-floor-host .door-light {
  fill: var(--blue-500); opacity: 0; transition: opacity 250ms ease;
}
.dust-floor-host .door-light.flash { animation: dust-floor-door-flash 1.1s ease-out; }
@keyframes dust-floor-door-flash {
  0%   { opacity: 0; }
  30%  { opacity: .9; }
  100% { opacity: 0; }
}
.dust-floor-host .door-light.active { opacity: 0.35; animation: dust-floor-door-pulse 1.4s ease-in-out infinite; }
@keyframes dust-floor-door-pulse { 0%,100% { opacity: 0.25; } 50% { opacity: 0.55; } }

.dust-floor-host .room-rect.active { stroke: var(--blue-400); stroke-width: 2; }
.dust-floor-host .room-glow { fill: var(--blue-500); opacity: 0; transition: opacity 400ms ease; }
.dust-floor-host .room-glow.active { opacity: 0.06; }

/* Isometric 3D shapes */
.dust-floor-host .ground { fill: #FAFAF8; }
.dust-floor-host .grid-line { stroke: rgba(17,20,24,0.06); stroke-width: 1; }
.dust-floor-host .roof { fill: #FFFFFF; stroke: rgba(17,20,24,0.12); stroke-width: 1; }
.dust-floor-host [data-room="office-d"]  .roof-logo { fill: #E2F78C !important; }
.dust-floor-host [data-room="office-c"]  .roof-logo { fill: #FFC3DF !important; }
.dust-floor-host [data-room="office-bl"] .roof-logo { fill: #9FDBFF !important; }
.dust-floor-host [data-room="office-t"]  .roof-logo { fill: #3B82F6 !important; }
.dust-floor-host .roof-edge { fill: none; stroke: rgba(17,20,24,0.18); stroke-width: 1.2; stroke-linejoin: round; }
.dust-floor-host .wall-right { fill: #EFEEE9; stroke: rgba(17,20,24,0.14); stroke-width: 1; }
.dust-floor-host .wall-front { fill: #E5E4DE; stroke: rgba(17,20,24,0.14); stroke-width: 1; }
.dust-floor-host .room-block { filter: url(#room-shadow); transition: transform 300ms ease; cursor: default; }
.dust-floor-host .room-block.active .roof { fill: #FFFFFF; }
.dust-floor-host .room-block.active .roof-logo { filter: brightness(1.05); }
.dust-floor-host .room-block.active .wall-front { fill: #EAE9E3; }
.dust-floor-host .room-label-g { display: none; }

.dust-floor-host .wall-logo { fill: #ECEAE3; stroke: rgba(17,20,24,0.14); stroke-width: 1; }
.dust-floor-host .roof-logo { stroke: rgba(17,20,24,0.22); stroke-width: 1.2; }
.dust-floor-host .roof-colored { stroke: rgba(17,20,24,0.16); stroke-width: 1; }

/* ===========================================================================
   Reduced motion — disable every decorative animation in the scene for users
   who request reduced motion. The chat-card entrance / exit and fly-reaction
   are also gated in JS (heroOfficeChatCard.ts checks the same media query).
   =========================================================================== */
@media (prefers-reduced-motion: reduce) {
  .dust-floor-host .human-body,
  .dust-floor-host .human.sway .human-body,
  .dust-floor-host .status-online-pulse,
  .dust-floor-host .activity-emoji.pop,
  .dust-floor-host .agent-body,
  .dust-floor-host .agent-halo,
  .dust-floor-host .agent.working .agent-halo,
  .dust-floor-host .agent-spark,
  .dust-floor-host .agent-trail,
  .dust-floor-host .door-light.flash,
  .dust-floor-host .door-light.active,
  .dust-floor-host .chat-card-caret,
  .dust-floor-host .chat-card-reactions .react-pill,
  .dust-floor-host .reaction-pill,
  .dust-floor-host .agent-tag .caret,
  .dust-floor-fly-emoji {
    animation: none !important;
    transition: none !important;
  }
}
`;
