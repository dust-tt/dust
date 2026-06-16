import type {
  MetronomeAlertRef,
  MetronomeAlertStatus,
} from "@app/lib/metronome/alerts/types";
import { getMetronomeAlertUrl } from "@app/lib/metronome/urls";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Chip, LinkExternal01 } from "@dust-tt/sparkle";

// Maps a Metronome alert's evaluation status to a Chip color and readable
// label. `in_alarm` (breached) reads red; `ok` (resolved) green; `evaluating`
// (pending) amber; `null` (unknown) neutral.
function alertStatusChip(status: MetronomeAlertStatus): {
  color: "rose" | "success" | "warning" | "info";
  label: string;
} {
  switch (status) {
    case "in_alarm":
      return { color: "rose", label: "in alarm" };
    case "ok":
      return { color: "success", label: "ok" };
    case "evaluating":
      return { color: "warning", label: "evaluating" };
    case null:
      return { color: "info", label: "unknown" };
    default:
      assertNeverAndIgnore(status);
      return { color: "info", label: "unknown" };
  }
}

interface AlertChipProps {
  alert: MetronomeAlertRef | null;
  label: string;
}

// A clickable badge deep-linking to a Metronome alert, labelled with the alert
// name and its current evaluation status and colored by that status. Renders
// nothing when the alert is unknown (not configured).
export function AlertChip({ alert, label }: AlertChipProps) {
  if (!alert) {
    return null;
  }
  const { color, label: statusLabel } = alertStatusChip(alert.status);
  return (
    <Chip
      size="xs"
      color={color}
      label={`${label}: ${statusLabel}`}
      icon={LinkExternal01}
      href={getMetronomeAlertUrl(alert.id)}
      target="_blank"
    />
  );
}
