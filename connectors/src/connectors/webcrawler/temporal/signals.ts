import { defineSignal } from "@temporalio/workflow";

export const newWebhookSignal = defineSignal<[void]>("new_webhook_signal");

export interface syncChannelSignalInput {
  channelIds: string[];
}
export const syncChannelSignal = defineSignal<[syncChannelSignalInput]>(
  "sync_channel_signal"
);
