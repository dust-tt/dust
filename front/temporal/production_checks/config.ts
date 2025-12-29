const QUEUE_VERSION = 1;
export const QUEUE_NAME = `production_checks-v${QUEUE_VERSION}`;

export const WORKFLOW_TYPE_RUN_ALL_CHECKS = "runAllChecksWorkflow";
export const WORKFLOW_TYPE_RUN_SINGLE_CHECK = "runSingleCheckWorkflow";

export type ProductionCheckWorkflowType =
  | typeof WORKFLOW_TYPE_RUN_ALL_CHECKS
  | typeof WORKFLOW_TYPE_RUN_SINGLE_CHECK;

export function isProductionCheckWorkflowType(
  type: string | undefined
): type is ProductionCheckWorkflowType {
  return (
    type === WORKFLOW_TYPE_RUN_ALL_CHECKS ||
    type === WORKFLOW_TYPE_RUN_SINGLE_CHECK
  );
}
