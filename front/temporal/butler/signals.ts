import { defineSignal } from "@temporalio/workflow";

export const butlerRefreshSignal = defineSignal<[string]>(
  "butler_refresh_signal"
);
export const butlerCompleteSignal = defineSignal<[string]>(
  "butler_complete_signal"
);
