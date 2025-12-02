import { defineSignal } from "@temporalio/workflow";

export const indexUserSearchSignal = defineSignal<[void]>(
  "index_user_search_signal"
);
