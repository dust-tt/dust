import { defineSignal } from "@temporalio/workflow";

export const runScrubFreeEndedWorkspacesSignal = defineSignal<[void]>(
  "run_scrub_free_ended_workspaces_signal"
);
