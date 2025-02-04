import type { TrackerIdWorkspaceId } from "@dust-tt/types";
import { defineSignal } from "@temporalio/workflow";

export const newUpsertSignal = defineSignal<[void]>("new_upsert_signal");

export const notifySignal =
  defineSignal<[TrackerIdWorkspaceId[]]>("notify_signal");
