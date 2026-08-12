import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";

export type ConsumptionPaceStatus = "on_pace" | "off_pace";

export type ConsumptionPace = {
  status: ConsumptionPaceStatus;
  usedRatio: number;
  elapsedRatio: number;
};

const PACE_TOLERANCE = 0.1;

function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function paceStatus(
  usedRatio: number,
  elapsedRatio: number
): ConsumptionPaceStatus {
  return usedRatio > elapsedRatio + PACE_TOLERANCE ? "off_pace" : "on_pace";
}

export function consumptionPace({
  usedCredits,
  capCredits,
  period,
  nowMs,
}: {
  usedCredits: number;
  capCredits: number;
  period: ConsumptionPeriod;
  nowMs: number;
}): ConsumptionPace | null {
  if (capCredits <= 0) {
    return null;
  }

  const startMs = new Date(period.startDate).getTime();
  const endMs = new Date(period.endDate).getTime();
  if (!(endMs > startMs)) {
    return null;
  }

  const usedRatio = clampRatio(usedCredits / capCredits);
  const elapsedRatio = clampRatio((nowMs - startMs) / (endMs - startMs));

  return {
    status: paceStatus(usedRatio, elapsedRatio),
    usedRatio,
    elapsedRatio,
  };
}

export function formatRatioAsPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
