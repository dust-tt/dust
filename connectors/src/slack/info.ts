import { SlackConfig } from "./interface";
import { WebClient } from '@slack/web-api';

export async function getTeamId(slackConfig: SlackConfig) {
  const client = new WebClient(slackConfig.accessToken);

  const teamInfo = await client.team.info();
  if (teamInfo.error) {
    throw new Error(teamInfo.error);
  }
  if (!teamInfo.team) {
    throw new Error('No team info returned');
  }
  if (!teamInfo.team.id) {
    throw new Error('No team id returned');
  }
  return teamInfo.team.id;
}