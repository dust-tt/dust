import { defineSignal } from "@temporalio/workflow";

export interface IntercomUpdateSignal {
  intercomId: string;
  type: "help_center" | "team";
  forceResync: boolean;
}

export const intercomUpdatesSignal = defineSignal<[IntercomUpdateSignal[]]>(
  "intercomUpdatesSignal"
);
