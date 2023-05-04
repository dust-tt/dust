import { defineSignal } from "@temporalio/workflow";

export const newWebhookSignal = defineSignal<[void]>("new_webhook_signal");
export interface botJoinedChanelSignalInput {
  channelId: string;
}
export const botJoinedChanelSignal = defineSignal<[botJoinedChanelSignalInput]>(
  "bot_joined_channel_signal"
);
