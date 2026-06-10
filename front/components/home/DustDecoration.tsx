import { classNames } from "@app/lib/utils";

/*
 * DustDecoration — a small pair of Dust brand shapes (green circle + pink
 * crescent) used to decorate pastel section cards, mirroring the brand accents
 * on dust.tt. Subtle, decorative only. Use sparingly — one per card.
 *
 * Place inside a `relative`-positioned container and pass `position` to anchor
 * it to a corner.
 */

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const POSITION_CLASSES: Record<Corner, string> = {
  "top-left": "left-6 top-6",
  "top-right": "right-6 top-6 rotate-90",
  "bottom-left": "bottom-6 left-6 -rotate-90",
  "bottom-right": "bottom-6 right-6 rotate-180",
};

interface DustDecorationProps {
  position: Corner;
  /** Render slightly larger shapes. */
  size?: "sm" | "md";
  className?: string;
}

export function DustDecoration({
  position,
  size = "sm",
  className,
}: DustDecorationProps) {
  const dim = size === "sm" ? "h-3.5" : "h-5";
  return (
    <div
      aria-hidden
      className={classNames(
        "pointer-events-none absolute z-0 flex items-center gap-1",
        POSITION_CLASSES[position],
        className ?? ""
      )}
    >
      {/* Green circle (Dust brand tea-green). */}
      <span
        className={classNames(
          "inline-block aspect-square rounded-full bg-green-300",
          dim
        )}
      />
      {/* Pink crescent (half circle facing right). */}
      <svg
        viewBox="0 0 24 24"
        className={classNames("inline-block aspect-square", dim)}
        fill="none"
        aria-hidden
      >
        <path d="M0 0a12 12 0 010 24V0z" fill="#FFC3DF" />
      </svg>
    </div>
  );
}
