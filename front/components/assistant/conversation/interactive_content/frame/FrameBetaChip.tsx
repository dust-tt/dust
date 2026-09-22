import { Chip, Tooltip } from "@dust-tt/sparkle";

const FRAMES_BETA_URL =
  "https://app.dust.tt/share/frame/c5d83f0e-4825-4c6f-b33a-6841b1490d19";

/**
 * Marks a Frame that declares functions as beta, wherever Dust renders the chrome around it.
 * Links out to the Frame documenting the beta, in a new tab so the Frame being viewed stays open.
 */
export function FrameBetaChip() {
  return (
    <Tooltip
      label="Click for more info on this beta"
      tooltipTriggerAsChild
      trigger={
        <span className="inline-flex shrink-0 items-center">
          <Chip
            size="mini"
            label="Beta"
            href={FRAMES_BETA_URL}
            target="_blank"
            rel="noopener noreferrer"
          />
        </span>
      }
    />
  );
}
