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
  return marker ? `${dateLabel} - Version ${marker.version}` : dateLabel;
}
