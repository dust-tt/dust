import { cn } from "@dust-tt/sparkle";
import { type RefObject, useLayoutEffect, useState } from "react";

// Who is editing the document right now: a coloured caret with a name tag
// at their position (after Claude's co-editing view), and a soft highlight
// on the text they just changed that fades away. Positions are document
// positions, laid out from the editor's own coordinates.

type EditorView = {
  coordsAtPos: (pos: number) => { left: number; top: number; bottom: number };
  domAtPos: (pos: number) => { node: Node; offset: number };
  state: { doc: { content: { size: number } } };
};

export interface Presence {
  id: string;
  name: string;
  /** Any CSS colour (a Sparkle token variable). */
  color: string;
  /** Caret position in the document. */
  pos: number;
  /** Text just changed, highlighted in the person's colour. */
  range?: { from: number; to: number } | null;
  /** The highlight is fading out. */
  fading?: boolean;
  /** The caret and tag are leaving. */
  leaving?: boolean;
}

const PEOPLE_COLORS = [
  "var(--color-pink-500)",
  "var(--color-violet-500)",
  "var(--color-emerald-500)",
  "var(--color-orange-500)",
  "var(--color-rose-500)",
  "var(--color-golden-500)",
];

/** A stable colour per person; agents use Dust blue. */
export function presenceColor(name: string, isAgent: boolean): string {
  if (isAgent) {
    return "var(--color-highlight-500)";
  }
  let hash = 0;
  for (const ch of name) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return PEOPLE_COLORS[hash % PEOPLE_COLORS.length];
}

type Box = { left: number; top: number; width: number; height: number };

function layout(view: EditorView, container: HTMLElement, p: Presence) {
  const box = container.getBoundingClientRect();
  const size = view.state.doc.content.size;
  const clamp = (n: number) => Math.max(1, Math.min(n, size - 1));
  const at = view.coordsAtPos(clamp(p.pos));
  const caret = {
    left: at.left - box.left,
    top: at.top - box.top,
    height: at.bottom - at.top,
  };
  let rects: Box[] = [];
  if (p.range && p.range.to > p.range.from) {
    try {
      const start = view.domAtPos(clamp(p.range.from));
      const end = view.domAtPos(clamp(p.range.to));
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      rects = [...range.getClientRects()].map((r) => ({
        left: r.left - box.left,
        top: r.top - box.top,
        width: r.width,
        height: r.height,
      }));
    } catch {
      rects = [];
    }
  }
  return { caret, rects };
}

export function PresenceLayer({
  view,
  containerRef,
  presences,
  layoutKey,
}: {
  view: EditorView | null;
  containerRef: RefObject<HTMLElement | null>;
  presences: Presence[];
  /** Changes when the text does, to re-measure. */
  layoutKey: unknown;
}) {
  const [boxes, setBoxes] = useState<Record<string, ReturnType<typeof layout>>>(
    {}
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!view || !container) {
      return;
    }
    const measure = () => {
      const next: Record<string, ReturnType<typeof layout>> = {};
      for (const p of presences) {
        try {
          next[p.id] = layout(view, container, p);
        } catch {
          // Position no longer in the document: skip until the next update.
        }
      }
      setBoxes(next);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [view, containerRef, presences, layoutKey]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
      {presences.map((p) => {
        const b = boxes[p.id];
        if (!b) {
          return null;
        }
        return (
          <div key={p.id}>
            {b.rects.map((r, i) => (
              <div
                key={i}
                className="absolute rounded-[3px] transition-opacity duration-[1600ms] ease-out"
                style={{
                  ...r,
                  backgroundColor: p.color,
                  opacity: p.fading ? 0 : 0.16,
                }}
              />
            ))}
            <div
              className={cn(
                "absolute transition-[left,top,opacity] duration-150 ease-out",
                p.leaving ? "opacity-0" : "opacity-100"
              )}
              style={{
                left: b.caret.left,
                top: b.caret.top,
                height: b.caret.height,
              }}
            >
              <div
                className="h-full w-[2px] rounded-full"
                style={{ backgroundColor: p.color }}
              />
              <div
                className="absolute bottom-full left-0 mb-0.5 whitespace-nowrap rounded-[4px] px-1.5 py-px text-[11px] font-medium leading-4 text-white shadow-sm"
                style={{ backgroundColor: p.color }}
              >
                {p.name}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
