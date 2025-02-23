import { describe, expect, test } from "bun:test";
import { Workflow } from "./workflow";

describe("Workflow", () => {
  describe("Basic Function Steps", () => {
    interface NumberInput {
      value: number;
    }

    test("should execute a single step workflow", async () => {
      const result = await new Workflow<NumberInput>("Simple Math")
        .addStep(() => ({
          id: "double",
          name: "Double Number",
          execute: async (input) => input.value * 2,
        }))
        .execute({ value: 5 });

      expect(result.status).toBe("completed");
      expect(result.output).toBe(10);
    });

    test("should execute multiple steps in sequence", async () => {
      type WrappedNumber = { number: number };

      const result = await new Workflow<NumberInput>("Math Chain")
        .addStep(() => ({
          id: "double" as const,
          name: "Double Number",
          execute: async (input) => input.value * 2,
        }))
        .addStep(() => ({
          id: "add-ten" as const,
          name: "Add Ten",
          execute: async (input, { previousOutputs }) => {
            return previousOutputs.double + 10;
          },
        }))
        .addStep(() => ({
          id: "wrap-number" as const,
          name: "Wrap Number",
          execute: async (
            input,
            { previousOutputs }
          ): Promise<WrappedNumber> => {
            return { number: previousOutputs["add-ten"] };
          },
        }))
        .addStep(() => ({
          id: "add-twenty" as const,
          name: "Add Twenty",
          execute: async (input, { previousOutputs }) => {
            return previousOutputs["wrap-number"].number + 20;
          },
        }))
        .addStep(() => ({
          id: "all-results" as const,
          name: "All Results",
          execute: async (input, { previousOutputs }) => {
            return {
              results: [
                {
                  stepId: "double" as const,
                  result: previousOutputs["double"],
                },
                {
                  stepId: "add-ten" as const,
                  result: previousOutputs["add-ten"],
                },
                {
                  stepId: "wrap-number" as const,
                  result: previousOutputs["wrap-number"],
                },
                {
                  stepId: "add-twenty" as const,
                  result: previousOutputs["add-twenty"],
                },
              ] as const,
            };
          },
        }))
        .addStep(() => ({
          id: "check-types" as const,
          name: "Check Types",
          execute: async (input, { previousOutputs }) => {
            ((_a: { stepId: "double"; x: number }) => undefined)({
              stepId: previousOutputs["all-results"].results[0].stepId,
              x: previousOutputs["all-results"].results[0].result,
            });
            ((_a: { stepId: "add-ten"; x: number }) => undefined)({
              stepId: previousOutputs["all-results"].results[1].stepId,
              x: previousOutputs["all-results"].results[1].result,
            });
            ((_a: { stepId: "wrap-number"; x: WrappedNumber }) => undefined)({
              stepId: previousOutputs["all-results"].results[2].stepId,
              x: previousOutputs["all-results"].results[2].result,
            });
            ((_a: { stepId: "add-twenty"; x: number }) => undefined)({
              stepId: previousOutputs["all-results"].results[3].stepId,
              x: previousOutputs["all-results"].results[3].result,
            });

            return { validTypes: true };
          },
        }))
        .addStep(() => ({
          id: "final-result" as const,
          name: "Final Result",
          execute: async (input, { previousOutputs }) => {
            return {
              finalResult: previousOutputs["add-twenty"],
            };
          },
        }))
        .execute({ value: 5 });

      expect(result.status).toBe("completed");
      expect(result.output).toEqual({ finalResult: 40 }); // (5 * 2) + 10 + 20
    });

    test("should handle step failure", async () => {
      const result = await new Workflow<NumberInput>("Failing Math")
        .addStep(() => ({
          id: "fail",
          name: "Fail Step",
          execute: async () => {
            throw new Error("Step failed");
          },
        }))
        .execute({ value: 5 });

      expect(result.status).toBe("failed");
      expect(result.error?.message).toBe("Step failed");
    });
  });

  describe("Type-Safe Step Dependencies", () => {
    interface ComplexInput {
      numbers: number[];
      operation: "sum" | "multiply";
    }

    test("should maintain type safety between steps", async () => {
      const result = await new Workflow<ComplexInput>("Type Safe Math")
        .addStep(() => ({
          id: "perform-operation",
          name: "Perform Operation",
          execute: async (input: ComplexInput) => {
            const result =
              input.operation === "sum"
                ? input.numbers.reduce((a, b) => a + b, 0)
                : input.numbers.reduce((a, b) => a * b, 1);

            return {
              result,
              operation: input.operation,
            };
          },
        }))
        .addStep(() => ({
          id: "format-result",
          name: "Format Result",
          execute: async (input, { previousOutputs }) => {
            const opResult = previousOutputs["perform-operation"];
            return {
              message: `The ${opResult.operation} of the numbers is:`,
              value: opResult.result,
            };
          },
        }))
        .execute({
          numbers: [1, 2, 3, 4],
          operation: "sum",
        });

      expect(result.status).toBe("completed");
      expect(result.output).toEqual({
        message: "The sum of the numbers is:",
        value: 10,
      });
    });
  });

  describe("Sub-Workflows", () => {
    interface NumberInput {
      value: number;
    }

    test("should execute nested workflows", async () => {
      // Create a sub-workflow that doubles a number
      const doubleWorkflow = new Workflow<NumberInput>("Double").addStep(
        () => ({
          id: "double",
          name: "Double Number",
          execute: async (input) => input.value * 2,
        })
      );

      const result = await new Workflow<NumberInput>("Main Flow")
        .addStep(() => ({
          id: "sub-workflow",
          name: "Double Sub-workflow",
          execute: async (input) => {
            const subResult = await doubleWorkflow.execute(input);
            if (subResult.status === "failed") throw subResult.error;
            return subResult.output!;
          },
        }))
        .addStep(() => ({
          id: "add-ten",
          name: "Add Ten",
          execute: async (input, { previousOutputs }) => {
            return previousOutputs["sub-workflow"] + 10;
          },
        }))
        .execute({ value: 5 });

      expect(result.status).toBe("completed");
      expect(result.output).toBe(20); // (5 * 2) + 10
    });

    test("should handle sub-workflow failures", async () => {
      // Create a failing sub-workflow
      const failingWorkflow = new Workflow<NumberInput>("Failing Sub").addStep(
        () => ({
          id: "fail",
          name: "Fail Step",
          execute: async () => {
            throw new Error("Sub-workflow failed");
          },
        })
      );

      const result = await new Workflow<NumberInput>("Main Flow")
        .addStep(() => ({
          id: "sub-workflow",
          name: "Failing Sub-workflow",
          execute: async (input) => {
            const subResult = await failingWorkflow.execute(input);
            if (subResult.status === "failed") throw subResult.error;
            return subResult.output!;
          },
        }))
        .execute({ value: 5 });

      expect(result.status).toBe("failed");
      expect(result.error?.message).toBe("Sub-workflow failed");
    });
  });

  describe("Workflow Reset", () => {
    interface NumberInput {
      value: number;
    }

    test("should reset workflow state", async () => {
      const workflow = new Workflow<NumberInput>("Resettable").addStep(() => ({
        id: "double",
        name: "Double Number",
        execute: async (input) => input.value * 2,
      }));

      // First execution
      let result = await workflow.execute({ value: 5 });
      expect(result.status).toBe("completed");
      expect(result.output).toBe(10);
      expect(workflow.status).toBe("completed");

      // Reset
      workflow.reset();
      expect(workflow.status).toBe("pending");

      // Second execution
      result = await workflow.execute({ value: 3 });
      expect(result.status).toBe("completed");
      expect(result.output).toBe(6);
    });
  });
});
