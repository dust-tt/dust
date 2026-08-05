import { defineSignal } from "@temporalio/workflow";

export const dustProjectSyncSignal = defineSignal<[void]>(
  "dust_project_sync_signal"
);
