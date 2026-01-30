import { defineSignal } from "@temporalio/workflow";

export type ResyncSignal = {}

export const resyncSignal = defineSignal<ResyncSignal[]>("resyncSignal");
