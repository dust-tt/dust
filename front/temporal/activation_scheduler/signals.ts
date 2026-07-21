import { defineSignal } from "@temporalio/workflow";

export const runActivationSignal = defineSignal<[void]>(
  "run_activation_signal"
);
