import { findVersionMarkerForDate } from "@app/components/agent_builder/observability/utils";

type VersionLike = { version: string; timestamp: number };

export function formatTimeSeriesTitle(
  dateLabel: string,
  timestamp: number,
  versionMarkers?: VersionLike[] | null
): string {
  if (!versionMarkers || versionMarkers.length === 0) {
    return dateLabel;
  }
  const marker = findVersionMarkerForDate(new Date(timestamp), versionMarkers);
  return marker ? `${dateLabel} - version ${marker.version}` : dateLabel;
}

export function normalizeVersionLabel(label: string): string {
  const s = String(label).trim();
  if (s.startsWith("v") || s.startsWith("V")) {
    return `version ${s.slice(1)}`;
  }
  return s;
}
