import { defineSignal } from "@temporalio/workflow";

export const consumptionEventsAppendedSignal = defineSignal<[void]>(
  "credit_consumption_events_appended_signal"
);
