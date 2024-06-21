import { slackConfig } from "@connectors/connectors/slack/lib/config";

export function makeDustAppUrl(path: string) {
  return `${slackConfig.getRequiredDustBaseUrl()}${path}`;
}
