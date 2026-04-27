// SVG builder for a human teammate in the office floor: avatar disc + real
// photo + status dot or activity emoji. The scene engine appends the
// returned <g> to the SVG and reads ad-hoc fields (_planX, _person, etc.)
// off it as the conductor runs.

// biome-ignore-all lint/suspicious/noExplicitAny: ad-hoc fields are stored
// directly on the SVG <g> (e.g. _planX, _person) and read by the scene
// engine. Typing them properly would require a parallel WeakMap and gain
// little — they are scoped to this scene.

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
