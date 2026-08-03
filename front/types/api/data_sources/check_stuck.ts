export type PendingActivityInfo = {
  activityId: string;
  activityType: string;
  attempt: number;
  lastFailure: string | null;
  state: string;
};

export type StuckWorkflowInfo = {
  workflowId: string;
  status: string;
  pendingActivities: PendingActivityInfo[];
  stuckActivities: PendingActivityInfo[];
  childWorkflows: StuckWorkflowInfo[];
};

export type CheckStuckResponseBody = {
  isStuck: boolean;
  workflows: StuckWorkflowInfo[];
  message: string;
};
