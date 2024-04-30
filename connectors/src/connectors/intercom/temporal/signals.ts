import { defineSignal } from "@temporalio/workflow";

export interface IntercomUpdateSignal {
  intercomId: string;
  type: "help_center" | "team" | "all_conversations";
  forceResync: boolean;
}

export const intercomUpdatesSignal = defineSignal<[IntercomUpdateSignal[]]>(
  "intercomUpdatesSignal"
);
