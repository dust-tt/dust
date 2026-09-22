import { Chip } from "@dust-tt/sparkle";

const FRAMES_BETA_URL =
  "https://app.dust.tt/share/frame/c5d83f0e-4825-4c6f-b33a-6841b1490d19";

/**
 * Marks a Frame that declares functions as beta, wherever Dust renders the chrome around it.
 * Links out to the Frame documenting the beta, in a new tab so the Frame being viewed stays open.
 */
export function FrameBetaChip() {
  return (
    <Chip
      size="mini"
      label="Beta"
      className="shrink-0"
      href={FRAMES_BETA_URL}
      target="_blank"
      rel="noopener noreferrer"
    />
  );
}
