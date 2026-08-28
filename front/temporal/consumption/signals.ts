import { defineSignal } from "@temporalio/workflow";

export const consumptionEventsAppendedSignal = defineSignal<[void]>(
  "consumption_events_appended_signal"
);
