import { defineSignal } from "@temporalio/workflow";

export const runSignal = defineSignal<[void]>("run_signal");
