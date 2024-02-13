import { defineSignal } from "@temporalio/workflow";

export interface IntercomUpdateSignal {
  intercomId: string;
  type: "help_center" | "team";
}

export const intercomUpdatesSignal = defineSignal<[IntercomUpdateSignal[]]>(
  "intercomUpdatesSignal"
);
