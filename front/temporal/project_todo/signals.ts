import { defineSignal } from "@temporalio/workflow";

export const todoRefreshSignal = defineSignal<[string]>(
  "project_todo_refresh_signal"
);
export const todoCompleteSignal = defineSignal<[string]>(
  "project_todo_complete_signal"
);

// Sent by projectTodoWorkflow to projectMergeWorkflow after a successful analysis run.
// Carries no payload — the merge workflow only needs to know "there is work to do".
export const mergeRequestSignal = defineSignal<[]>(
  "project_todo_merge_request_signal"
);
