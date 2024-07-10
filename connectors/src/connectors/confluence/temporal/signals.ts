import { defineSignal } from "@temporalio/workflow";

export interface SpaceUpdatesSignal {
  action: "added" | "removed";
  forceUpsert: boolean;
  spaceId: string;
}

export const spaceUpdatesSignal =
  defineSignal<[SpaceUpdatesSignal[]]>("spaceUpdateSignal");
