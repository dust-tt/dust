import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import type { Authenticator } from "@app/lib/auth";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { launchMetronomeSeatCountSyncWorkflow } from "@app/temporal/usage_queue/client";
import type { MembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// A single scheduled phase of a seat-limit configuration, as returned by the
// read path. Dates are ISO strings for transport; `endAt` (derived server-side)
// is null for the open-ended final phase. Phases are contiguous: a phase's
// `endAt` equals the next phase's `startAt`.
export type SeatLimitSchedulePhase = {
  minSeats: number;
  maxSeats: number | null;
  startAt: string;
  endAt: string | null;
};

// A phase as submitted by the client (write path): only the start matters —
// end dates are derived server-side to keep the timeline contiguous.
export type SeatLimitScheduleInputPhase = {
  minSeats: number;
  maxSeats: number | null;
  startAt: string;
};

export type PokeSeatLimitScheduleResponseBody = {
  schedule: Partial<Record<MembershipSeatType, SeatLimitSchedulePhase[]>>;
};

// Phase with a parsed date, as accepted by the write path.
type SeatLimitSchedulePhaseInput = {
  minSeats: number;
  maxSeats: number | null;
  startAt: Date;
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

  // `manage-seat-limits` is a no-op plugin (see manage_seat_limits.ts):
  // it exists only so this endpoint can save a plugin record for the
  // change it makes, the same way upgrade.ts/downgrade.ts do.
  const plugin = pluginManager.getNonNullablePlugin("manage-seat-limits");
  const pluginRun = await PluginRunResource.makeNew(
    plugin,
    {
      seatType: [seatType],
      phasesJson: JSON.stringify(
        phases.map((phase) => ({
          ...phase,
          startAt: phase.startAt.toISOString(),
        }))
      ),
    },
    auth.getPokePrincipal().email,
    workspace,
    { resourceId: workspace.sId, resourceType: "workspaces" }
  );

  const saveResult = await WorkspaceSeatLimitResource.setScheduleForSeatType({
    workspace,
    seatType,
    phases,
  });
  if (saveResult.isErr()) {
    await pluginRun.recordError(saveResult.error.message);
    return saveResult;
  }

  const syncResult = await launchMetronomeSeatCountSyncWorkflow({
    workspaceId: workspace.sId,
  });
  if (syncResult.isErr()) {
    const errorMessage =
      "Seat-limit schedule saved, but the Metronome seat sync failed to " +
      `launch: ${syncResult.error.message}. Re-run once resolved.`;
    await pluginRun.recordError(errorMessage);
    return new Err(new Error(errorMessage));
  }

  await pluginRun.recordResult({
    display: "text",
    value: `Seat limits for '${seatType}' scheduled (${phases.length} phase${
      phases.length === 1 ? "" : "s"
    }).`,
  });

  return new Ok(undefined);
}
