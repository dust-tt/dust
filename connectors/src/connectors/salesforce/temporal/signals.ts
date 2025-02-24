import { defineSignal } from "@temporalio/workflow";

export interface ResyncSignal {}

export const resyncSignal = defineSignal<ResyncSignal[]>("resyncSignal");
