import { defineSignal } from "@temporalio/workflow";

export interface SpaceUpdatesSignal {
  spaceId: string;
  action: "added" | "removed";
}

export const spaceUpdatesSignal =
  defineSignal<[SpaceUpdatesSignal[]]>("spaceUpdateSignal");
