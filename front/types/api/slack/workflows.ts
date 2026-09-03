export type SlackWorkflowType = {
  botName: string;
  spaces: { sId: string; name: string }[];
  createdAt: number;
};

export type GetSlackWorkflowsResponseBody = {
  isSlackBotConnected: boolean;
  workflows: SlackWorkflowType[];
};
