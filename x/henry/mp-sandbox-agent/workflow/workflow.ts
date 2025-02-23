import { v4 as uuidv4 } from "uuid";
import type {
  WorkflowStepResult,
  WorkflowStepStatus,
  StepContext,
  WorkflowStep,
} from "./types";

// Helper type to extract the output type from a step
export type StepOutput<T> = T extends WorkflowStep<any, infer O, any>
  ? O
  : never;

// Helper type to extract the ID from a step
export type StepId<T> = T extends { id: infer I extends string } ? I : never;

// Helper type to create a mapping of step IDs to their output types
type StepOutputsRecord<T extends readonly WorkflowStep<any, any, any>[]> = {
  [I in T[number]["id"]]: Extract<T[number], { id: I }>["execute"] extends (
    input: any,
    context: any
  ) => Promise<infer O>
    ? O
    : never;
};

// Helper type to extract step type by ID
export type StepWithId<T, I extends string> = Extract<T, { id: I }>;

// Helper type to create a union of all step IDs
type StepIds<T extends readonly WorkflowStep<any, any, any>[]> = {
  [K in keyof T]: T[K] extends { id: infer I extends string } ? I : never;
}[number];

export class Workflow<
  TInput,
  TSteps extends readonly WorkflowStep<TInput, any, any>[] = readonly []
> {
  readonly id: string;
  readonly name: string;
  readonly status: WorkflowStepStatus = "pending";

  readonly steps: TSteps = [] as unknown as TSteps;
  private currentStepIndex = 0;
  private stepOutputs = new Map<string, unknown>();

  constructor(name: string) {
    this.id = uuidv4();
    this.name = name;
  }

  private updateStatus(status: WorkflowStepStatus): void {
    (this.status as WorkflowStepStatus) = status;
  }

  addStep<
    TNewStep extends WorkflowStep<TInput, any, StepOutputsRecord<TSteps>>
  >(
    createStep: (context: StepContext<StepOutputsRecord<TSteps>>) => TNewStep
  ): Workflow<TInput, readonly [...TSteps, TNewStep]> {
    const outputs = {} as StepOutputsRecord<TSteps>;
    for (const step of this.steps) {
      const output = this.stepOutputs.get(step.id);
      if (output !== undefined) {
        outputs[step.id as keyof typeof outputs] = output as StepOutput<
          typeof step
        >;
      }
    }

    const step = createStep({
      previousOutputs: outputs,
      workflowInput: undefined as TInput, // Will be provided during execution
    });

    step.status = "pending";

    const newWorkflow = this as unknown as Workflow<
      TInput,
      readonly [...TSteps, TNewStep]
    >;
    (newWorkflow.steps as unknown as WorkflowStep<TInput, any, any>[]).push(
      step
    );
    return newWorkflow;
  }

  private async executeStep<T extends TSteps[number]>(
    step: T,
    input: TInput,
    stepOutputs: StepOutputsRecord<TSteps>
  ): Promise<WorkflowStepResult<StepOutput<T>>> {
    try {
      step.status = "running";
      console.log(`Executing step ${step.id} with outputs:`, stepOutputs);
      const output = await step.execute(input, {
        previousOutputs: stepOutputs,
        workflowInput: input,
      });
      console.log(`Step ${step.id} output:`, output);
      step.status = "completed";
      step.output = output;

      return {
        status: "completed",
        output,
      };
    } catch (error) {
      console.error(`Step ${step.id} failed:`, error);
      step.status = "failed";
      step.error = error as Error;

      return {
        status: "failed",
        error: error as Error,
      };
    }
  }

  async execute(
    workflowInput: TInput
  ): Promise<WorkflowStepResult<StepOutput<TSteps[number]>>> {
    this.updateStatus("running");
    this.stepOutputs.clear();
    this.currentStepIndex = 0;

    try {
      let currentValue: unknown = undefined;
      while (this.currentStepIndex < this.steps.length) {
        const currentStep = this.steps[this.currentStepIndex];
        const stepOutputs = {} as StepOutputsRecord<TSteps>;

        // Build the outputs object with all previous step outputs
        for (let i = 0; i < this.currentStepIndex; i++) {
          const step = this.steps[i];
          const output = this.stepOutputs.get(step.id);
          if (output !== undefined) {
            (stepOutputs as any)[step.id] = output as StepOutput<typeof step>;
          }
        }

        console.log(`Step ${this.currentStepIndex} outputs:`, stepOutputs);
        const stepResult = await this.executeStep(
          currentStep,
          workflowInput,
          stepOutputs
        );

        if (stepResult.status === "failed") {
          this.updateStatus("failed");
          return stepResult;
        }

        currentValue = stepResult.output;
        this.stepOutputs.set(currentStep.id, currentValue);
        console.log(`Stored output for step ${currentStep.id}:`, currentValue);
        this.currentStepIndex++;
      }

      this.updateStatus("completed");
      console.log("Final output:", currentValue);
      return {
        status: "completed",
        output: currentValue as StepOutput<TSteps[number]>,
      };
    } catch (error) {
      console.error("Workflow execution failed:", error);
      this.updateStatus("failed");
      return {
        status: "failed",
        error: error as Error,
      };
    }
  }

  reset(): void {
    this.updateStatus("pending");
    this.currentStepIndex = 0;
    this.stepOutputs.clear();

    for (const step of this.steps) {
      step.status = "pending";
      step.output = undefined;
      step.error = undefined;
    }
  }

  getSteps(): ReadonlyArray<TSteps[number]> {
    return this.steps;
  }
}
