import { defineSignal } from "@temporalio/workflow";

export const todoRefreshSignal = defineSignal<[string]>(
  "project_todo_refresh_signal"
);
export const todoCompleteSignal = defineSignal<[string]>(
  "project_todo_complete_signal"
);
