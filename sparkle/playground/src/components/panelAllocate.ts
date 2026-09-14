/**
 * Focus-based sizing: compact panels hold their width, focus takes the rest.
 *
 * Worked examples (minimal 384, compact 512 — the playground defaults):
 *   allocateFocusPanels(1500, [compact, focus])         → [512, 988]
 *   allocateFocusPanels(1500, [compact, focus, shared]) → [476, 512, 512]
 *     (the compact panel shrinks toward minimal so the flex panels can both
 *      reach their own compact width)
 *   allocateFocusPanels(900, [compact, focus])          → [388, 512]
 */

export type PanelRole = "focus" | "shared" | "compact";

export interface PanelSizingSpec {
  role: PanelRole;
  /** Hard floor — neither manual resize nor the shrink cascade go below it. */
  minimal: number;
  /** Width held when the panel is not the focus panel. */
  compact: number;
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

/**
 * Split `available` across visible panels.
 * Compact-role panels hold their compact width; the focus panel and any
 * shared panels split the remainder equally, never below their minimal.
 * If the remainder cannot cover the flex panels' minimals, compact panels
 * shrink toward their own minimal, upper-most (lowest index) first.
 */
export function allocateFocusPanels(
  available: number,
  panels: PanelSizingSpec[]
): number[] {
  const n = panels.length;
  if (n === 0) {
    return [];
  }
  if (n === 1) {
    return [Math.max(0, available)];
  }

  // Flex panels (focus + shared) share the remainder. Someone must take it:
  // if every panel is compact-role, the deepest one flexes.
  const flexIdx = panels
    .map((p, i) => (p.role !== "compact" ? i : -1))
    .filter((i) => i >= 0);
  const flexSet = new Set(flexIdx.length > 0 ? flexIdx : [n - 1]);

  const widths = panels.map((p, i) =>
    flexSet.has(i) ? p.minimal : Math.max(p.minimal, p.compact)
  );

  // Shrink compact panels (upper-most first) when space is tight — enough for
  // the flex panels to reach their own compact width, so the focus panel is
  // never the only one squeezed while compact panels sit at full width.
  const flexWant = panels.reduce(
    (sum, p, i) =>
      flexSet.has(i) ? sum + Math.max(0, p.compact - p.minimal) : sum,
    0
  );
  let deficit = widths.reduce((sum, w) => sum + w, 0) + flexWant - available;
  for (let i = 0; i < n && deficit > 0; i++) {
    if (flexSet.has(i)) {
      continue;
    }
    const give = Math.min(deficit, widths[i] - panels[i].minimal);
    widths[i] -= give;
    deficit -= give;
  }

  // Flex panels split what's left above their minimals, equally.
  const used = widths.reduce((sum, w) => sum + w, 0);
  const topUp = Math.max(0, available - used) / flexSet.size;
  return widths.map((w, i) => (flexSet.has(i) ? w + topUp : w));
}

/**
 * While dragging a splitter, only the two panels beside it move.
 * `frozenOther` is a third column that must keep its start-of-drag width.
 */
export function applySplitDrag({
  available,
  mouse,
  leftMin,
  neighborMin,
  frozenOther = 0,
}: {
  available: number;
  mouse: number;
  leftMin: number;
  neighborMin: number;
  frozenOther?: number;
}): { left: number; neighbor: number } {
  const left = clamp(
    mouse,
    leftMin,
    Math.max(leftMin, available - neighborMin - frozenOther)
  );
  return { left, neighbor: available - left - frozenOther };
}
