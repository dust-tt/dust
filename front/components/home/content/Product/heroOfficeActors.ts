// SVG builders for the home-page hero scene: human teammates (avatar disc +
// real photo + status dot or activity emoji) and AI agents (halo + disc +
// robot glyph + floating @label / message tag). These are pure factory
// functions; the scene engine appends the returned <g> to the SVG and adds
// per-frame state on top via ad-hoc fields.

// biome-ignore-all lint/suspicious/noExplicitAny: ad-hoc fields are stored
// directly on the SVG <g> (e.g. _planX, _person, _idleLabel) and read by the
// scene engine. Typing them properly would require a parallel WeakMap and
// gain little — they are scoped to this scene and never leave the file pair.

import {
  iso,
  SVG_NS,
} from "@app/components/home/content/Product/heroOfficeIso";
import type { TeamMember } from "@app/components/home/content/shared/team";

const AVATAR_COLORS = [
  "#5865F2",
  "#418B5C",
  "#1C91FF",
  "#FFAA0D",
  "#E14322",
  "#9B59B6",
  "#EB459E",
  "#00B8A3",
  "#F47B2A",
  "#596170",
];

const STATUSES = [
  "online",
  "online",
  "online",
  "online",
  "idle",
  "online",
  "busy",
  "online",
];

/** Emoji pool shown above ~25% of the humans (rotates every ~2.6s). */
export const ACTIVITY_EMOJIS = ["☕️", "🍽️", "🌴", "🎧", "📞", "🥑", "🍵", "🍕"];

/** Build a human teammate group: avatar disc behind the photo, white ring,
 *  and either a colored status dot or a circulating activity emoji. The
 *  caller threads `_planX`, `_planY`, `_roomKey`, and `_person` onto the
 *  returned element so the conductor can find them later. */
export function buildHuman(
  cx: number,
  cy: number,
  seed: number,
  roomKey: string | null,
  person: TeamMember
): SVGGElement {
  const color = AVATAR_COLORS[(seed * 7) % AVATAR_COLORS.length];
  const status = STATUSES[seed % STATUSES.length];

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.setAttribute("class", `human ${seed % 2 === 0 ? "sway" : ""}`);
  g.style.animationDelay = ((seed * 0.37) % 5) + "s";
  const [tx, ty] = iso(cx, cy, 22);
  g.setAttribute("transform", `translate(${tx},${ty})`);
  (g as any)._planX = cx;
  (g as any)._planY = cy;
  (g as any)._roomKey = roomKey;
  (g as any)._person = person;
  if (roomKey) {
    g.dataset.room = roomKey;
  }

  // soft drop shadow under the avatar
  const sh = document.createElementNS(SVG_NS, "ellipse");
  sh.setAttribute("cx", "0");
  sh.setAttribute("cy", "22");
  sh.setAttribute("rx", "20");
  sh.setAttribute("ry", "5");
  sh.setAttribute("fill", "rgba(17,20,24,0.14)");
  g.appendChild(sh);

  const body = document.createElementNS(SVG_NS, "g");
  body.setAttribute("class", "human-body");

  // colored disc (visible as a thin ring around the photo)
  const disc = document.createElementNS(SVG_NS, "circle");
  disc.setAttribute("cx", "0");
  disc.setAttribute("cy", "0");
  disc.setAttribute("r", "23");
  disc.setAttribute("fill", color);
  body.appendChild(disc);

  // teammate photo
  const photo = document.createElementNS(SVG_NS, "image");
  photo.setAttributeNS("http://www.w3.org/1999/xlink", "href", person.image);
  photo.setAttribute("href", person.image);
  photo.setAttribute("x", "-20");
  photo.setAttribute("y", "-20");
  photo.setAttribute("width", "40");
  photo.setAttribute("height", "40");
  photo.setAttribute("preserveAspectRatio", "xMidYMid slice");
  photo.style.clipPath = "circle(20px at 20px 20px)";
  body.appendChild(photo);

  // crisp white edge
  const ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("cx", "0");
  ring.setAttribute("cy", "0");
  ring.setAttribute("r", "20");
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke", "#FFFFFF");
  ring.setAttribute("stroke-width", "0.75");
  body.appendChild(ring);

  // status corner — emoji for ~25% of seats, otherwise a colored dot
  const sx = 20;
  const sy = 20;
  const useEmoji = (seed * 13) % 4 === 0;
  if (useEmoji) {
    const bg = document.createElementNS(SVG_NS, "circle");
    bg.setAttribute("cx", String(sx));
    bg.setAttribute("cy", String(sy));
    bg.setAttribute("r", "10.4");
    bg.setAttribute("fill", "#FFFFFF");
    bg.setAttribute("stroke", "rgba(17,20,24,0.08)");
    bg.setAttribute("stroke-width", "1.6");
    body.appendChild(bg);
    const emoji = document.createElementNS(SVG_NS, "text");
    emoji.setAttribute("text-anchor", "middle");
    emoji.setAttribute("x", String(sx));
    emoji.setAttribute("y", String(sy + 5.2));
    emoji.setAttribute(
      "style",
      "font: 14px/1 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji', sans-serif;"
    );
    emoji.setAttribute("class", "activity-emoji");
    emoji.textContent = ACTIVITY_EMOJIS[seed % ACTIVITY_EMOJIS.length];
    body.appendChild(emoji);
  } else {
    if (status === "online") {
      const pulse = document.createElementNS(SVG_NS, "circle");
      pulse.setAttribute("class", "status-online-pulse");
      pulse.setAttribute("cx", String(sx));
      pulse.setAttribute("cy", String(sy));
      pulse.setAttribute("r", "6");
      pulse.setAttribute("fill", "#3BA55D");
      body.appendChild(pulse);
    }
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("class", `status-dot status-${status}`);
    dot.setAttribute("cx", String(sx));
    dot.setAttribute("cy", String(sy));
    dot.setAttribute("r", "8");
    body.appendChild(dot);
  }

  g.appendChild(body);
  return g;
}

/** Build an AI agent group: pulsing halo, blue disc with a robot glyph, an
 *  invisible 56px hit target for grabbing, and a floating @label tag. The
 *  caller positions the agent (sets `--x`/`--y` and `_planX`/`_planY` etc.)
 *  after appending the returned element to the SVG. */
export function buildAgent(id: string, label: string): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.setAttribute("class", "agent");
  g.setAttribute("id", id);

  const halo = document.createElementNS(SVG_NS, "circle");
  halo.setAttribute("class", "agent-halo");
  halo.setAttribute("r", "44");
  halo.setAttribute("fill", "#4BABFF");
  g.appendChild(halo);

  const body = document.createElementNS(SVG_NS, "g");
  body.setAttribute("class", "agent-body");

  const disc = document.createElementNS(SVG_NS, "circle");
  disc.setAttribute("r", "22");
  disc.setAttribute("fill", "#1C91FF");
  disc.setAttribute("stroke", "#FFFFFF");
  disc.setAttribute("stroke-width", "4");
  body.appendChild(disc);

  // Sparkle robot glyph (24x24 viewBox, scaled to fit the disc)
  const robot = document.createElementNS(SVG_NS, "path");
  robot.setAttribute(
    "d",
    "M12 14a8 8 0 0 1 8 8H4a8 8 0 0 1 8-8m2-11h3a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h3V2h4zM8 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4m8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4"
  );
  robot.setAttribute("fill", "#FFFFFF");
  robot.setAttribute("transform", "translate(-17.2,-17.2) scale(1.44)");
  body.appendChild(robot);

  g.appendChild(body);

  // Invisible 56px hit target — the visible body is only ~22px so this
  // gives a forgiving grab area for drag-to-move.
  const hit = document.createElementNS(SVG_NS, "circle");
  hit.setAttribute("r", "56");
  hit.setAttribute("fill", "transparent");
  hit.setAttribute("class", "agent-hit");
  g.appendChild(hit);

  // Floating chip above the agent. Holds the @name when idle and morphs
  // into the typed message during dialogue.
  const tag = document.createElementNS(SVG_NS, "g");
  tag.setAttribute("class", "agent-tag");
  tag.setAttribute("transform", "translate(0,-44)");
  const tagBg = document.createElementNS(SVG_NS, "rect");
  const idleW = 16 + label.length * 12.4;
  tagBg.setAttribute("x", String(-idleW / 2));
  tagBg.setAttribute("y", "-20");
  tagBg.setAttribute("width", String(idleW));
  tagBg.setAttribute("height", "32");
  tagBg.setAttribute("rx", "16");
  tag.appendChild(tagBg);
  const txt = document.createElementNS(SVG_NS, "text");
  txt.setAttribute("text-anchor", "middle");
  txt.setAttribute("y", "3");
  tag.appendChild(txt);
  g.appendChild(tag);

  (g as any)._agentTag = tag;
  (g as any)._tagBg = tagBg;
  (g as any)._tagTxt = txt;
  (g as any)._idleLabel = label;
  (g as any)._idleWidth = idleW;

  return g;
}
