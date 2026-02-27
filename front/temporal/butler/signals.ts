import { defineSignal } from "@temporalio/workflow";

export const butlerRefreshSignal = defineSignal<[void]>(
  "butler_refresh_signal"
);
export const butlerCompleteSignal = defineSignal<[void]>(
  "butler_complete_signal"
);
