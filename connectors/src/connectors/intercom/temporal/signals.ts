import { defineSignal } from "@temporalio/workflow";

export interface IntercomUpdateSignal {
  intercomId: string;
  type: "help_center"; // we will add the "team" value for conversations
}

export const intercomUpdatesSignal = defineSignal<[IntercomUpdateSignal[]]>(
  "intercomUpdatesSignal"
);
