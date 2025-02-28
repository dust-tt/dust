export type WorkflowStepStatus = "pending" | "running" | "completed" | "failed";

export interface WorkflowStepResult<T> {
  status: WorkflowStepStatus;
  output?: T;
  error?: Error;
}

// Type to represent the context available to a step
export type StepContext<T extends Record<string, unknown>> = {
  previousOutputs: T;
  workflowInput: unknown;
};

export interface WorkflowStep<
  Input,
  Output,
  Context extends Record<string, unknown>
> {
  id: string;
  name: string;
  execute: (input: Input, context: StepContext<Context>) => Promise<Output>;
  status?: WorkflowStepStatus;
  output?: Output;
  error?: Error;
}
