import { defineSignal } from "@temporalio/workflow";

interface ResyncSignal {}

export const resyncSignal = defineSignal<ResyncSignal[]>("resyncSignal");
