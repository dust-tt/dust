import { useSendNotification } from "@app/hooks/useNotification";
import type {
  PokeSeatLimitScheduleResponseBody,
  SeatLimitScheduleInputPhase,
} from "@app/lib/api/poke/seat_limits_schedule";
import { clientFetch } from "@app/lib/egress/client";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { MembershipSeatType } from "@app/types/memberships";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

export function usePokeSeatLimitSchedule({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const scheduleFetcher: Fetcher<PokeSeatLimitScheduleResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/seat_limits_schedule`,
    scheduleFetcher,
    { disabled }
  );

  return {
    schedule: data?.schedule ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

export function useUpdatePokeSeatLimitSchedule({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();

  return async ({
    seatType,
    phases,
  }: {
    seatType: MembershipSeatType;
    phases: SeatLimitScheduleInputPhase[];
  }): Promise<boolean> => {
    const r = await clientFetch(
      `/api/poke/workspaces/${owner.sId}/seat_limits_schedule`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatType, phases }),
      }
    );
    if (!r.ok) {
      sendNotification({
        title: "Error saving seat-limit schedule",
        type: "error",
        description: `Something went wrong: ${r.status} ${await r.text()}`,
      });
      return false;
    }
    sendNotification({
      title: "Seat-limit schedule saved",
      type: "success",
    });
    return true;
  };
}
