import { z } from "zod";

// Define the plan structure based on the createPlan tool
const SubtaskSchema = z.object({
  task_name: z.string(),
  description: z.string(),
  done: z.boolean(),
});

const TaskSchema = z.object({
  task_name: z.string(),
  description: z.string(),
  done: z.boolean(),
  subtasks: z.array(SubtaskSchema).optional(),
});

const PlanSchema = z.object({
  plan_id: z.string(),
  created_at: z.string(),
  total_tasks: z.number(),
  completed_tasks: z.number(),
  progress_percentage: z.number(),
  tasks: z.array(TaskSchema),
});

export type Plan = z.infer<typeof PlanSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Subtask = z.infer<typeof SubtaskSchema>;

export interface PlanUpdateEvent {
  type: "plan_created" | "plan_updated" | "task_completed" | "plan_completed" | "plan_cleared";
  plan?: Plan;
  updatedTask?: Task;
}

export type PlanUpdateCallback = (event: PlanUpdateEvent) => void;

class PlanManager {
  private currentPlan: Plan | null = null;
  private planHistory: Plan[] = [];
  private updateCallbacks: PlanUpdateCallback[] = [];

  constructor() {
    // No super() call needed since we're not extending EventEmitter
  }

  /**
   * Add a callback to be notified of plan updates
   */
  addUpdateCallback(callback: PlanUpdateCallback): void {
    this.updateCallbacks.push(callback);
  }

  /**
   * Remove a callback from plan update notifications
   */
  removeUpdateCallback(callback: PlanUpdateCallback): void {
    const index = this.updateCallbacks.indexOf(callback);
    if (index > -1) {
      this.updateCallbacks.splice(index, 1);
    }
  }

  /**
   * Clear all update callbacks
   */
  clearUpdateCallbacks(): void {
    this.updateCallbacks = [];
  }

  /**
   * Notify all registered callbacks of a plan update
   */
  private notifyCallbacks(event: PlanUpdateEvent): void {
    this.updateCallbacks.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        console.error("Error in plan update callback:", error);
      }
    });
  }

  /**
   * Set the current active plan
   */
  setCurrentPlan(plan: Plan): void {
    const previousPlan = this.currentPlan;
    this.currentPlan = plan;
    this.planHistory.push(plan);

    if (!previousPlan) {
      this.notifyCallbacks({ type: "plan_created", plan });
    } else {
      // Check if any tasks were completed
      const completedTasks = this.findCompletedTasks(previousPlan, plan);
      if (completedTasks.length > 0) {
        completedTasks.forEach((task) => {
          this.notifyCallbacks({ type: "task_completed", plan, updatedTask: task });
        });
      }

      // Check if plan is now complete
      if (plan.progress_percentage === 100 && previousPlan.progress_percentage < 100) {
        this.notifyCallbacks({ type: "plan_completed", plan });
      } else {
        this.notifyCallbacks({ type: "plan_updated", plan });
      }
    }
  }

  /**
   * Get the current active plan
   */
  getCurrentPlan(): Plan | null {
    return this.currentPlan;
  }

  /**
   * Clear the current plan
   */
  clearCurrentPlan(): void {
    this.currentPlan = null;
    this.notifyCallbacks({ type: "plan_cleared" });
  }

  /**
   * Get plan history
   */
  getPlanHistory(): Plan[] {
    return [...this.planHistory];
  }

  /**
   * Update a specific task in the current plan
   */
  updateTask(taskName: string, updates: Partial<Task>): void {
    if (!this.currentPlan) {
      return;
    }

    const updatedTasks = this.currentPlan.tasks.map((task) =>
      task.task_name === taskName ? { ...task, ...updates } : task
    );

    const updatedPlan = {
      ...this.currentPlan,
      tasks: updatedTasks,
      ...this.calculateProgress(updatedTasks),
    };

    this.setCurrentPlan(updatedPlan);
  }

  /**
   * Update a specific subtask in the current plan
   */
  updateSubtask(taskName: string, subtaskName: string, updates: Partial<Subtask>): void {
    if (!this.currentPlan) {
      return;
    }

    const updatedTasks = this.currentPlan.tasks.map((task) => {
      if (task.task_name === taskName && task.subtasks) {
        const updatedSubtasks = task.subtasks.map((subtask) =>
          subtask.task_name === subtaskName ? { ...subtask, ...updates } : subtask
        );
        return { ...task, subtasks: updatedSubtasks };
      }
      return task;
    });

    const updatedPlan = {
      ...this.currentPlan,
      tasks: updatedTasks,
      ...this.calculateProgress(updatedTasks),
    };

    this.setCurrentPlan(updatedPlan);
  }

  /**
   * Calculate progress statistics for a set of tasks
   */
  private calculateProgress(tasks: Task[]): { total_tasks: number; completed_tasks: number; progress_percentage: number } {
    const totalTasks = this.countTotalTasks(tasks);
    const completedTasks = this.countCompletedTasks(tasks);
    const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      progress_percentage: progressPercentage,
    };
  }

  /**
   * Count total tasks including subtasks
   */
  private countTotalTasks(tasks: Task[]): number {
    return tasks.reduce((total, task) => {
      const subtaskCount = task.subtasks ? task.subtasks.length : 0;
      return total + 1 + subtaskCount;
    }, 0);
  }

  /**
   * Count completed tasks including subtasks
   */
  private countCompletedTasks(tasks: Task[]): number {
    return tasks.reduce((completed, task) => {
      let taskCompleted = task.done ? 1 : 0;
      const subtaskCompleted = task.subtasks
        ? task.subtasks.filter((subtask) => subtask.done).length
        : 0;
      return completed + taskCompleted + subtaskCompleted;
    }, 0);
  }

  /**
   * Find tasks that were completed between two plan versions
   */
  private findCompletedTasks(previousPlan: Plan, currentPlan: Plan): Task[] {
    const completedTasks: Task[] = [];

    for (let i = 0; i < currentPlan.tasks.length; i++) {
      const currentTask = currentPlan.tasks[i];
      const previousTask = previousPlan.tasks[i];

      if (previousTask && !previousTask.done && currentTask.done) {
        completedTasks.push(currentTask);
      }

      // Check subtasks
      if (currentTask.subtasks && previousTask?.subtasks) {
        for (let j = 0; j < currentTask.subtasks.length; j++) {
          const currentSubtask = currentTask.subtasks[j];
          const previousSubtask = previousTask.subtasks[j];

          if (previousSubtask && !previousSubtask.done && currentSubtask.done) {
            // Create a task-like object for the completed subtask
            completedTasks.push({
              task_name: `${currentTask.task_name} > ${currentSubtask.task_name}`,
              description: currentSubtask.description,
              done: true,
            });
          }
        }
      }
    }

    return completedTasks;
  }

  /**
   * Parse a plan from JSON string (from createPlan tool output)
   */
  static parsePlan(planJson: string): Plan | null {
    try {
      const parsed = JSON.parse(planJson);
      return PlanSchema.parse(parsed);
    } catch (error) {
      console.error("Failed to parse plan:", error);
      return null;
    }
  }

  /**
   * Format a plan for display
   */
  static formatPlan(plan: Plan): string {
    const lines: string[] = [];
    lines.push(`📋 Plan: ${plan.plan_id}`);
    lines.push(`📈 Progress: ${plan.completed_tasks}/${plan.total_tasks} (${plan.progress_percentage}%)`);
    lines.push(`🕐 Created: ${new Date(plan.created_at).toLocaleString()}`);
    lines.push("");

    plan.tasks.forEach((task, index) => {
      const status = task.done ? "✅" : "⏳";
      lines.push(`${index + 1}. ${status} ${task.task_name}`);
      lines.push(`   ${task.description}`);

      if (task.subtasks) {
        task.subtasks.forEach((subtask, subIndex) => {
          const subStatus = subtask.done ? "✅" : "⏳";
          lines.push(`   ${index + 1}.${subIndex + 1}. ${subStatus} ${subtask.task_name}`);
          lines.push(`        ${subtask.description}`);
        });
      }
      lines.push("");
    });

    return lines.join("\n");
  }
}

// Export a singleton instance
export const planManager = new PlanManager();