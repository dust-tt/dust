import type { ModelId } from "@app/types/shared/model_id";
import moment from "moment-timezone";

// A pod's numeric model id is already a well-distributed, stable integer, so
// taking it modulo the window size gives a deterministic per-pod offset
// without hashing anything.
export function getPodNudgeSlotMinutes(
  podModelId: ModelId,
  windowMinutes: number
): number {
  return podModelId % windowMinutes;
}

// Computes the absolute epoch ms of a pod's nudge slot: `windowStartMinutes`
// (minutes from midnight) on `now`'s calendar day in `timezone`, plus the
// pod's deterministic offset within `windowMinutes`.
export function getNudgeSlotAtMs({
  podModelId,
  timezone,
  windowStartMinutes,
  windowMinutes,
  now,
}: {
  podModelId: ModelId;
  timezone: string;
  windowStartMinutes: number;
  windowMinutes: number;
  now: Date;
}): number {
  const windowStart = moment
    .tz(now, timezone)
    .startOf("day")
    .add(windowStartMinutes, "minutes");

  const slotMinutes = getPodNudgeSlotMinutes(podModelId, windowMinutes);

  return windowStart.add(slotMinutes, "minutes").valueOf();
}
