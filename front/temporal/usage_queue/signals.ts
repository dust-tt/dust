import { defineSignal } from "@temporalio/workflow";

export const syncMetronomeSeatCountSignal = defineSignal<
  [{ immediate?: boolean }?]
>("sync_metronome_seat_count_signal");

export const reconcileApiKeyCreditStateSignal = defineSignal<[void]>(
  "reconcile_api_key_credit_state_signal"
);
