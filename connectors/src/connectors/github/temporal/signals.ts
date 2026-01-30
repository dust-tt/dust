import { defineSignal } from "@temporalio/workflow";

export const newWebhookSignal = defineSignal<[undefined]>("new_webhook_signal");
