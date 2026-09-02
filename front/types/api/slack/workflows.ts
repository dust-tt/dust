export type SlackWorkflowType = {
  botName: string;
  groups: { sId: string; name: string }[];
  createdAt: number;
};

export type GetSlackWorkflowsResponseBody = {
  isSlackBotConnected: boolean;
  workflows: SlackWorkflowType[];
};
