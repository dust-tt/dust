export type GroupWorkflowAlertThreshold =
  | { kind: "disabled" }
  | { kind: "enabled"; awuCredits: number };

export type SetGroupWorkflowAlertThresholdResponse = {
  threshold: GroupWorkflowAlertThreshold;
};

export type PutGroupWorkflowAlertThresholdResponseBody =
  SetGroupWorkflowAlertThresholdResponse;
