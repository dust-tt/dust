import type { ModelId } from "@app/types/shared/model_id";
import { startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

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
  const startOfDayMs = fromZonedTime(
    startOfDay(toZonedTime(now, timezone)),
    timezone
  ).getTime();
  const windowStartMs = startOfDayMs + windowStartMinutes * 60_000;

  const slotMinutes = getPodNudgeSlotMinutes(podModelId, windowMinutes);

  return windowStartMs + slotMinutes * 60_000;
}
