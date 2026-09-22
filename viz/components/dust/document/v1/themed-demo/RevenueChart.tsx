import { useState } from "react";

const QUARTERS = [
  { label: "Q1", revenue: 42 },
  { label: "Q2", revenue: 58 },
  { label: "Q3", revenue: 73 },
  { label: "Q4", revenue: 91 },
];

/** Example Frame-authored visual. Sparkle has no knowledge of these data or chart controls. */
export const RevenueChart = () => {
  const [quarter, setQuarter] = useState(2);
  const selected = QUARTERS[quarter];
  return (
    <figure
      aria-label="Illustrative quarterly revenue"
      className="m-0 overflow-hidden border p-6"
      style={{
        background: "var(--document-surface, #edf3f7)",
        borderColor: "var(--document-border, #b8cad7)",
        borderRadius: "var(--document-radius, 12px)",
        fontFamily: "var(--document-font-body, sans-serif)",
      }}
    >
      <figcaption className="flex items-start justify-between gap-4">
        <span
          className="text-sm"
          style={{ color: "var(--document-muted, #526576)" }}
        >
          Illustrative revenue · $ thousands
        </span>
        <span
          aria-live="polite"
          className="text-2xl font-semibold"
          style={{ color: "var(--document-accent, #245d85)" }}
        >
          {selected.label}: ${selected.revenue}k
        </span>
      </figcaption>
      <div
        className="mt-8 flex h-44 items-end gap-4"
        role="group"
        aria-label="Quarter"
      >
        {QUARTERS.map((item, index) => (
          <button
            key={item.label}
            type="button"
            aria-label={`Select ${item.label}`}
            aria-pressed={quarter === index}
            className="flex h-full flex-1 flex-col justify-end gap-3 rounded-sm outline-offset-4"
            onClick={() => setQuarter(index)}
          >
            <span
              className="block w-full rounded-t-sm"
              style={{
                height: `${item.revenue}%`,
                background: "var(--document-accent, #245d85)",
                opacity: quarter === index ? 1 : 0.45,
              }}
            />
            <span
              className="block text-xs"
              style={{ color: "var(--document-foreground, #202f3c)" }}
            >
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </figure>
  );
};
