import { defineSignal } from "@temporalio/workflow";

import type { TrackerIdWorkspaceId } from "@app/types";

export const newUpsertSignal = defineSignal<[void]>("new_upsert_signal");

export const notifySignal =
  defineSignal<[TrackerIdWorkspaceId[]]>("notify_signal");
