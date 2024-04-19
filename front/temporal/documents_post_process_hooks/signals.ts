import { defineSignal } from "@temporalio/workflow";

export const newUpsertSignal = defineSignal<[void]>("new_upsert_signal");
