import { WebClient } from '@slack/web-api';
import { DustConfig, SlackConfig } from './interface';

export async function slackSyncChannelUnthreaded(
  client: WebClient,
  dustConfig: DustConfig,
  channel_id: string,
  thread_ts: string
) {
  throw new Error('not implemented');
}
