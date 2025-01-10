import { defineSignal } from "@temporalio/workflow";

export interface ZendeskUpdateSignal {
  zendeskId: number;
  type: "brand" | "help-center" | "tickets";
  forceResync: boolean;
}

export interface ZendeskCategoryUpdateSignal {
  brandId: number;
  categoryId: number;
  type: "category";
  forceResync: boolean;
}

export const zendeskUpdatesSignal = defineSignal<
  [(ZendeskUpdateSignal | ZendeskCategoryUpdateSignal)[]]
>("zendeskUpdatesSignal");
