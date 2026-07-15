import type { Authenticator } from "@app/lib/auth";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { launchMetronomeSeatCountSyncWorkflow } from "@app/temporal/usage_queue/client";
import type { MembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// A single scheduled phase of a seat-limit configuration, over the window
// `[startAt, endAt)`. Dates are ISO strings for transport; `endAt` null means
// the phase is open-ended (the current/final configuration).
export type SeatLimitSchedulePhase = {
  minSeats: number;
  maxSeats: number | null;
  startAt: string;
  endAt: string | null;
};

export type PokeSeatLimitScheduleResponseBody = {
  schedule: Partial<Record<MembershipSeatType, SeatLimitSchedulePhase[]>>;
};

// Phase with parsed dates, as accepted by the write path.
type SeatLimitSchedulePhaseInput = {
  minSeats: number;
  maxSeats: number | null;
  startAt: Date;
  endAt: Date | null;
};

// Read the current + scheduled-future seat-limit schedule for a workspace,
// serialized for the poke UI. Historical (already-ended) phases are omitted.
export async function getSeatLimitSchedule(
  auth: Authenticator
): Promise<PokeSeatLimitScheduleResponseBody> {
  const workspace = auth.getNonNullableWorkspace();
  const schedule = await WorkspaceSeatLimitResource.fetchScheduleByWorkspace({
    workspace,
  });

  const result: PokeSeatLimitScheduleResponseBody["schedule"] = {};
  for (const [seatType, segments] of schedule) {
    result[seatType] = segments.map((segment) => ({
      minSeats: segment.minSeats,
      maxSeats: segment.maxSeats,
      startAt: segment.startAt.toISOString(),
      endAt: segment.endAt?.toISOString() ?? null,
    }));
  }
  return { schedule: result };
}

// Replace the full schedule of phases for a single seat type, then re-launch
// the Metronome seat sync so the change (and any future-dated phases) are
// programmed into Metronome immediately.
export async function setSeatLimitScheduleForSeatType(
  auth: Authenticator,
  {
    seatType,
    phases,
  }: {
    seatType: MembershipSeatType;
    phases: SeatLimitSchedulePhaseInput[];
  }
): Promise<Result<void, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const saveResult = await WorkspaceSeatLimitResource.setScheduleForSeatType({
    workspace,
    seatType,
    phases,
  });
  if (saveResult.isErr()) {
    return saveResult;
  }

  const syncResult = await launchMetronomeSeatCountSyncWorkflow({
    workspaceId: workspace.sId,
  });
  if (syncResult.isErr()) {
    return new Err(
      new Error(
        "Seat-limit schedule saved, but the Metronome seat sync failed to " +
          `launch: ${syncResult.error.message}. Re-run once resolved.`
      )
    );
  }

  return new Ok(undefined);
}
