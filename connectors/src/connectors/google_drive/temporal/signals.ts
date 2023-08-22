import { defineSignal } from "@temporalio/workflow";

export const newWebhookSignal = defineSignal<[void]>("new_webhook_signal");
