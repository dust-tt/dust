import { defineSignal } from "@temporalio/workflow";

export interface UpdateSpacePermissionsSignal {
  debounceMs: number;
}

export const updateSpacePermissionsSignal = defineSignal<
  [UpdateSpacePermissionsSignal[]]
>("updateSpacePermissionsSignal");
