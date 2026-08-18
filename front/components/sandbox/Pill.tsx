type PillColor = "blue" | "golden" | "neutral";

// Small rounded status pill, shared by the egress request rows and the
// Computer admin comparison views.
const PILL_CLASSES: Record<PillColor, string> = {
  blue: "bg-blue-100 text-blue-800",
  golden: "bg-golden-100 text-golden-800",
  neutral: "bg-primary-100 text-primary-700",
};

interface PillProps {
  color: PillColor;
  label: string;
}

export function Pill({ color, label }: PillProps) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PILL_CLASSES[color]}`}
    >
      {label}
    </span>
  );
}
