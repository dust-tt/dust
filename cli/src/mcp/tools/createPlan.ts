import { z } from "zod";

import { normalizeError } from "../../utils/errors.js";
import { planManager } from "../../utils/planManager.js";
import type { McpTool } from "../types/tools.js";

const SubtaskSchema = z.object({
  task_name: z.string().describe("Name/title of the subtask"),
  description: z
    .string()
    .describe("Detailed description of what needs to be done"),
  done: z.boolean().describe("Whether the subtask is completed"),
});

const TaskSchema = z.object({
  task_name: z.string().describe("Name/title of the task"),
  description: z
    .string()
    .describe("Detailed description of what needs to be done"),
  done: z.boolean().describe("Whether the task is completed"),
  subtasks: z
    .array(SubtaskSchema)
    .optional()
    .describe("Optional subtasks for this task"),
});

export class CreatePlanTool implements McpTool {
  name = "create_plan";
  description =
    "A tool for creating and managing structured task plans using JSON objects. Use this tool when you encounter complex tasks that would benefit from step-by-step planning and execution.\n\n" +
    "WHEN TO USE:\n" +
    "- Complex multi-step tasks that require careful coordination\n" +
    "- Tasks involving multiple files, components, or systems\n" +
    "- When you need to track progress through a series of related actions\n" +
    "- Any task that would benefit from breaking down into smaller, manageable steps\n\n" +
    "HOW TO USE:\n" +
    "1. When you see a complex task, create a plan by breaking it into logical steps\n" +
    "2. Always prefer to begin your plan by understanding the context of the user's request. Take a few steps to read files and explore directories to understand how the user has done things in the past.\n" +
    "2. Set all tasks to 'done: false' initially\n" +
    "3. Follow the plan step-by-step, updating 'done: true' as you complete each task using the update_plan tool\n" +
    "4. Feel free to modify the plan (add, remove, or change tasks) if a better approach emerges\n" +
    "5. Continue until all tasks are marked as complete\n\n" +
    "PLAN STRUCTURE:\n" +
    "Each task should have: task_name, description, done (boolean), and optional subtasks array.\n" +
    "The tool automatically calculates progress and provides a structured overview of the entire plan.\n\n" +
    "IMPORTANT: After creating a plan, use the update_plan tool to mark tasks as completed as you work through them.";

  inputSchema = z.object({
    tasks: z
      .array(TaskSchema)
      .describe(
        "Array of tasks to create a plan from. Break complex work into logical steps with clear task names and descriptions. " +
          "Start with all tasks marked as 'done: false', then update them to 'done: true' as you complete each step using the update_plan tool. " +
          "Use subtasks for complex tasks that need further breakdown. Modify the plan as needed if requirements change."
      ),
  });

  async execute({ tasks }: z.infer<typeof this.inputSchema>) {
    try {
      const plan = this.generatePlan(tasks);

      // Update the plan manager with the new plan
      planManager.setCurrentPlan(plan);

      return {
        content: [
          // TODO: JSON is slow, find something else
          {
            type: "text" as const,
            text: JSON.stringify(plan, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error creating plan: ${normalizeError(error).message}`,
          },
        ],
        isError: true,
      };
    }
  }

  private generatePlan(tasks: z.infer<typeof TaskSchema>[]): {
    plan_id: string;
    created_at: string;
    total_tasks: number;
    completed_tasks: number;
    progress_percentage: number;
    tasks: z.infer<typeof TaskSchema>[];
  } {
    const now = new Date().toISOString();
    const planId = `plan_${Date.now()}`;

    // Calculate progress
    const totalTasks = this.countTotalTasks(tasks);
    const completedTasks = this.countCompletedTasks(tasks);
    const progressPercentage =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      plan_id: planId,
      created_at: now,
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      progress_percentage: progressPercentage,
      tasks: tasks,
    };
  }

  private countTotalTasks(tasks: z.infer<typeof TaskSchema>[]): number {
    return tasks.reduce((total, task) => {
      const subtaskCount = task.subtasks ? task.subtasks.length : 0;
      return total + 1 + subtaskCount;
    }, 0);
  }

  private countCompletedTasks(tasks: z.infer<typeof TaskSchema>[]): number {
    return tasks.reduce((completed, task) => {
      let taskCompleted = task.done ? 1 : 0;
      const subtaskCompleted = task.subtasks
        ? task.subtasks.filter((subtask) => subtask.done).length
        : 0;
      return completed + taskCompleted + subtaskCompleted;
    }, 0);
  }
}

export class UpdatePlanTool implements McpTool {
  name = "update_plan";
  description =
    "A tool for updating the current active plan by marking tasks or subtasks as completed, or modifying the plan structure.\n\n" +
    "WHEN TO USE:\n" +
    "- When you have completed a task or subtask and want to mark it as done\n" +
    "- When you need to modify the plan by adding, removing, or changing tasks\n" +
    "- To update task descriptions or add new subtasks\n\n" +
    "HOW TO USE:\n" +
    "1. Call this tool after completing any task or subtask\n" +
    "2. Provide the updated tasks array with the current completion status\n" +
    "3. The tool will automatically calculate progress and notify the user\n" +
    "4. You can add new tasks, remove tasks, or modify existing ones\n\n" +
    "IMPORTANT: Always provide the complete updated tasks array, not just the changed tasks.";

  inputSchema = z.object({
    tasks: z
      .array(TaskSchema)
      .describe(
        "Complete updated array of tasks with current completion status. " +
          "Mark tasks as 'done: true' when completed, and update subtasks as needed. " +
          "You can add new tasks, remove tasks, or modify existing ones."
      ),
  });

  async execute({ tasks }: z.infer<typeof this.inputSchema>) {
    try {
      const currentPlan = planManager.getCurrentPlan();
      if (!currentPlan) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No active plan found. Create a plan first using the create_plan tool.",
            },
          ],
          isError: true,
        };
      }

      // Generate updated plan with same ID but new timestamp
      const updatedPlan = {
        ...currentPlan,
        tasks: tasks,
        ...this.calculateProgress(tasks),
      };

      // Update the plan manager with the updated plan
      planManager.setCurrentPlan(updatedPlan);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(updatedPlan, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error updating plan: ${normalizeError(error).message}`,
          },
        ],
        isError: true,
      };
    }
  }

  private calculateProgress(tasks: z.infer<typeof TaskSchema>[]): {
    total_tasks: number;
    completed_tasks: number;
    progress_percentage: number;
  } {
    const totalTasks = this.countTotalTasks(tasks);
    const completedTasks = this.countCompletedTasks(tasks);
    const progressPercentage =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      progress_percentage: progressPercentage,
    };
  }

  private countTotalTasks(tasks: z.infer<typeof TaskSchema>[]): number {
    return tasks.reduce((total, task) => {
      const subtaskCount = task.subtasks ? task.subtasks.length : 0;
      return total + 1 + subtaskCount;
    }, 0);
  }

  private countCompletedTasks(tasks: z.infer<typeof TaskSchema>[]): number {
    return tasks.reduce((completed, task) => {
      let taskCompleted = task.done ? 1 : 0;
      const subtaskCompleted = task.subtasks
        ? task.subtasks.filter((subtask) => subtask.done).length
        : 0;
      return completed + taskCompleted + subtaskCompleted;
    }, 0);
  }
}
