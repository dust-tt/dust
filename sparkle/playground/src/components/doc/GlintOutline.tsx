// "Agent is working" outline: a highlight stretch travelling around a
// control's border, after the conversation input bar's streaming pill (front,
// ConversationNavigationPill). Drawn exactly over a 1px border: wrap the
// control in a positioned element and set `radius` to its corner radius.

// SVG can't paint a gradient along a path, so the stretch is a stack of
// segments sharing one head (the leading end), each shorter one bluer: a soft
// highlight-300 → highlight-100 fade from the head to the tail. Lengths are %
// of the outline.
const LENGTH = 35;
const STEPS = 10;
const LAYERS = Array.from({ length: STEPS }, (_, i) => {
  const t = i / (STEPS - 1); // 0 = tail (longest, lightest), 1 = head.
  return {
    length: LENGTH * (1 - (i / STEPS) * 0.9),
    color: `color-mix(in oklab, var(--color-highlight-300) ${Math.round(
      t * 100
    )}%, var(--color-highlight-100))`,
  };
});

export function GlintOutline({ radius }: { radius: number }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    >
      {LAYERS.map(({ length, color }) => (
        <rect
          key={length}
          className="doc-glint"
          style={{
            // Centered on the border line: inset by half the stroke.
            x: 0.5,
            y: 0.5,
            width: "calc(100% - 1px)",
            height: "calc(100% - 1px)",
          }}
          rx={radius - 0.5}
          pathLength={100}
          fill="none"
          stroke={color}
          strokeWidth={1}
          // A leading gap lines every segment's head up with the longest
          // one's (one keyframe animation drives every layer).
          strokeDasharray={`0 ${LENGTH - length} ${length} ${100 - LENGTH}`}
        />
      ))}
    </svg>
  );
}
