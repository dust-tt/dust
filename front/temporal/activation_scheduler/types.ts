export type ActivationNudgeWorkflowContext = {
  sessionGoal: string | null;
  pushedResourceType: "skill" | "agent" | null;
  pushedResourceName: string | null;
  workAreas: string | null;
  activationPlaybook: string | null;
};

export type ActivationWorkspaceWorkflowArgs = {
  workspaceId: string;
  userIds?: string[] | null;
  overrideChecks?: boolean;
  context?: ActivationNudgeWorkflowContext | null;
};
