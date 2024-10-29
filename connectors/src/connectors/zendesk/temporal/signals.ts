import { defineSignal } from "@temporalio/workflow";

export interface ZendeskUpdateSignal {
  zendeskId: number;
  type: "brand" | "help-center" | "tickets" | "category";
  forceResync: boolean;
}

export const zendeskUpdatesSignal = defineSignal<[ZendeskUpdateSignal[]]>(
  "zendeskUpdatesSignal"
);
