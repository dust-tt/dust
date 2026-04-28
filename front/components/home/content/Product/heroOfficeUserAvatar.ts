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

  // Status badge sits at this position. Pulled inward from (20,20) so the
  // chip reads as nestled into the bottom-right corner instead of half-
  // dangling off the avatar.
  const sx = 16;
  const sy = 16;
  const useEmoji = (seed * 13) % 4 === 0;
  const badgeRadius = useEmoji ? 9 : 7;

  // Real cutout via SVG mask: white square minus a black hole at the badge
  // position. Applying this mask to the disc + photo group leaves a true
  // empty region — the badge then sits directly in that hole, no border.
  const maskId = `dust-avatar-mask-${seed}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const defs = document.createElementNS(SVG_NS, "defs");
  const mask = document.createElementNS(SVG_NS, "mask");
  mask.setAttribute("id", maskId);
  mask.setAttribute("maskUnits", "userSpaceOnUse");
  const maskFill = document.createElementNS(SVG_NS, "rect");
  maskFill.setAttribute("x", "-25");
  maskFill.setAttribute("y", "-25");
  maskFill.setAttribute("width", "50");
  maskFill.setAttribute("height", "50");
  maskFill.setAttribute("fill", "white");
  mask.appendChild(maskFill);
  const maskHole = document.createElementNS(SVG_NS, "circle");
  maskHole.setAttribute("cx", String(sx));
  maskHole.setAttribute("cy", String(sy));
  // Hole slightly larger than the badge so there's a faint ring of breathing
  // room around it (~1px) — keeps the badge from kissing the avatar edge.
  maskHole.setAttribute("r", String(badgeRadius + 1));
  maskHole.setAttribute("fill", "black");
  mask.appendChild(maskHole);
  defs.appendChild(mask);
  body.appendChild(defs);

  // Disc + photo go in a sub-group so the mask only carves them, not the
  // badge that we render on top.
  const photoGroup = document.createElementNS(SVG_NS, "g");
  photoGroup.setAttribute("mask", `url(#${maskId})`);

  const disc = document.createElementNS(SVG_NS, "circle");
  disc.setAttribute("cx", "0");
  disc.setAttribute("cy", "0");
  disc.setAttribute("r", "23");
  disc.setAttribute("fill", "#E9ECEF");
  photoGroup.appendChild(disc);

  const photo = document.createElementNS(SVG_NS, "image");
  photo.setAttributeNS("http://www.w3.org/1999/xlink", "href", person.image);
  photo.setAttribute("href", person.image);
  photo.setAttribute("x", "-20");
  photo.setAttribute("y", "-20");
  photo.setAttribute("width", "40");
  photo.setAttribute("height", "40");
  photo.setAttribute("preserveAspectRatio", "xMidYMid slice");
  photo.style.clipPath = "circle(20px at 20px 20px)";
  photoGroup.appendChild(photo);

  body.appendChild(photoGroup);

  // Badge rendered on top of the cutout, no border needed.
  if (useEmoji) {
    const bg = document.createElementNS(SVG_NS, "circle");
    bg.setAttribute("cx", String(sx));
    bg.setAttribute("cy", String(sy));
    bg.setAttribute("r", String(badgeRadius));
    bg.setAttribute("fill", "#FFFFFF");
    body.appendChild(bg);
    const emoji = document.createElementNS(SVG_NS, "text");
    emoji.setAttribute("text-anchor", "middle");
    emoji.setAttribute("x", String(sx));
    emoji.setAttribute("y", String(sy + 4.2));
    emoji.setAttribute(
      "style",
      "font: 12px/1 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji', sans-serif;"
    );
    emoji.setAttribute("class", "activity-emoji");
    emoji.textContent = ACTIVITY_EMOJIS[seed % ACTIVITY_EMOJIS.length];
    body.appendChild(emoji);
  } else {
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("class", `status-dot status-${status}`);
    dot.setAttribute("cx", String(sx));
    dot.setAttribute("cy", String(sy));
    dot.setAttribute("r", String(badgeRadius));
    body.appendChild(dot);
  }

  g.appendChild(body);
  return g;
}
