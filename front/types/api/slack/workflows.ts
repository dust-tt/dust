import type { GroupKind } from "@app/types/groups";

export const SLACK_WORKFLOW_GROUP_KINDS: GroupKind[] = [
  "global",
  "provisioned",
  "regular_auto",
  "regular_manual",
];

export type SlackWorkflowType = {
  botName: string;
  spaces: { sId: string; name: string }[];
  createdAt: number;
};

export type GetSlackWorkflowsResponseBody = {
  isSlackBotConnected: boolean;
  workflows: SlackWorkflowType[];
};
