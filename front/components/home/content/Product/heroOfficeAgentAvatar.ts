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
 *  flow can swap the visible text during dialogue.
 *
 *  `iconSvg` is the inner markup of a 24x24 viewBox icon (paths, circles, etc.)
 *  rendered as the agent's glyph on the floor (stroked white, centered on the
 *  blue disc). When `iconImage` is provided, the disc + iconSvg pipeline is
 *  bypassed entirely and the image is rendered as the whole avatar — useful
 *  for full-color illustrated agents. The gray ring is preserved via a
 *  same-radius unfilled stroke on top of the image. */
export function buildAgent(
  id: string,
  label: string,
  iconSvg: string,
  iconImage?: string
): SVGGElement {
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

  if (iconImage) {
    // Image-based agent — render the asset clipped to the disc shape so the
    // shadow/halo and ring stay consistent with the SVG-glyph agents.
    const clipId = `agent-clip-${id}`;
    const defs = document.createElementNS(SVG_NS, "defs");
    const clip = document.createElementNS(SVG_NS, "clipPath");
    clip.setAttribute("id", clipId);
    const clipCircle = document.createElementNS(SVG_NS, "circle");
    clipCircle.setAttribute("r", "22");
    clip.appendChild(clipCircle);
    defs.appendChild(clip);
    body.appendChild(defs);

    const img = document.createElementNS(SVG_NS, "image");
    img.setAttributeNS("http://www.w3.org/1999/xlink", "href", iconImage);
    img.setAttribute("href", iconImage);
    img.setAttribute("x", "-22");
    img.setAttribute("y", "-22");
    img.setAttribute("width", "44");
    img.setAttribute("height", "44");
    img.setAttribute("preserveAspectRatio", "xMidYMid slice");
    img.setAttribute("clip-path", `url(#${clipId})`);
    body.appendChild(img);

    // Match the gray ring used by the human + SVG-glyph agents so the
    // family reads consistently.
    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("r", "22");
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "#E9ECEF");
    ring.setAttribute("stroke-width", "3");
    body.appendChild(ring);
  } else {
    // Stroke matches the human avatars' effective ring (the 3px gap between
    // the gray disc fill and the photo).
    const disc = document.createElementNS(SVG_NS, "circle");
    disc.setAttribute("r", "22");
    disc.setAttribute("fill", "#1C91FF");
    disc.setAttribute("stroke", "#E9ECEF");
    disc.setAttribute("stroke-width", "3");
    body.appendChild(disc);

    // Per-agent glyph — the 24x24 viewBox is centered on the disc by
    // translating (-12, -12) before a 1.4x scale, so the icon reads at
    // floor scale. innerHTML is fine here because iconSvg is a hard-coded
    // constant in heroOfficeScenario.
    const icon = document.createElementNS(SVG_NS, "g");
    icon.setAttribute("transform", "translate(-16.8,-16.8) scale(1.4)");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "#FFFFFF");
    icon.setAttribute("stroke-width", "1.8");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    icon.innerHTML = iconSvg;
    body.appendChild(icon);
  }

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
