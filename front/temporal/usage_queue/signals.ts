import { defineSignal } from "@temporalio/workflow";

export const syncMetronomeSeatCountSignal = defineSignal<[void]>(
  "sync_metronome_seat_count_signal"
);
