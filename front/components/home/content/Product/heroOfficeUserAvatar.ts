// SVG builder for a human teammate in the office floor: avatar disc + real
// photo + status dot. The scene engine appends the returned <g> to the SVG
// and reads ad-hoc fields (_planX, _person, etc.) off it as the conductor
// runs.

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

/** Build a human teammate group: avatar disc behind the photo, white ring,
 *  and a colored status dot. The caller threads `_planX`, `_planY`,
 *  `_roomKey`, and `_person` onto the returned element so the conductor
 *  can find them later. */
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
  sh.setAttribute("class", "human-shadow");
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
  const badgeRadius = 7;

  // Disc + photo render directly into the animated body. We used to wrap
  // them in a sub-group with an SVG `<mask>` to carve a real cutout for the
  // status badge, but at high browser zoom that mask had to re-rasterize
  // every animation frame for each of the ~22 humans, blowing the
  // per-frame paint budget and causing avatars to flicker independently.
  // The badge's stroke (matching the disc fill) provides the same visual
  // cutout effect via overdraw — no mask, no per-frame raster cost.
  const disc = document.createElementNS(SVG_NS, "circle");
  disc.setAttribute("cx", "0");
  disc.setAttribute("cy", "0");
  disc.setAttribute("r", "23");
  disc.setAttribute("fill", "#E9ECEF");
  body.appendChild(disc);

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

  // Badge sits on top of the photo. The stroke (#E9ECEF, matching the disc
  // fill) reads as a continuation of the disc ring around the badge.
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("class", `status-dot status-${status}`);
  dot.setAttribute("cx", String(sx));
  dot.setAttribute("cy", String(sy));
  dot.setAttribute("r", String(badgeRadius));
  body.appendChild(dot);

  g.appendChild(body);
  return g;
}
