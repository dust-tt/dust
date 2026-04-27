// SVG builder for an AI agent in the office floor: pulsing halo + blue
// disc + sparkle robot glyph + floating @label tag. The caller positions
// the agent (sets `--x`/`--y` and `_planX`/`_planY` etc.) after appending
// the returned element to the SVG.

// biome-ignore-all lint/suspicious/noExplicitAny: ad-hoc fields are stored
// directly on the SVG <g> (e.g. _agentTag, _tagBg, _idleLabel) and read by
// the scene engine. Typing them properly would require a parallel WeakMap
// and gain little — they are scoped to this scene.

import { SVG_NS } from "@app/components/home/content/Product/heroOfficeIso";

/** Build an AI agent group. Returns the <g> element with an attached @label
 *  chip; the chip's tspan node is exposed via `g._tagTxt` so the chat-card
 *  flow can swap the visible text during dialogue. */
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
