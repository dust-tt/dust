import { z } from "zod";

import { normalizeError } from "../../utils/errors.js";
import type { McpTool } from "../types/tools.js";

export class CreatePlanTool implements McpTool {
  name = "create_plan";
  description =
    "A tool for creating structured plans to break down complex tasks into manageable steps. This tool helps organize multi-step processes, track progress, and ensure systematic completion of complex objectives.";

  inputSchema = z.object({
    task_description: z
      .string()
      .describe(
        "A clear description of the overall task or objective that needs to be accomplished"
      ),
    complexity_level: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe(
        "Optional: The estimated complexity level of the task (low, medium, high). Helps determine the level of detail needed in the plan (default: medium)"
      ),
    estimated_duration: z
      .string()
      .optional()
      .describe(
        "Optional: Estimated time to complete the entire task (e.g., '2 hours', '1 day', '1 week'). Helps with planning and prioritization"
      ),
    dependencies: z
      .array(z.string())
      .optional()
      .describe(
        "Optional: List of prerequisites, tools, or resources needed before starting the task"
      ),
    constraints: z
      .array(z.string())
      .optional()
      .describe(
        "Optional: Any limitations, restrictions, or special requirements that must be considered during execution"
      ),
    success_criteria: z
      .array(z.string())
      .optional()
      .describe(
        "Optional: Specific criteria that define when the task is considered complete and successful"
      ),
  });

  async execute({
    task_description,
    complexity_level = "medium",
    estimated_duration,
    dependencies = [],
    constraints = [],
    success_criteria = [],
  }: z.infer<typeof this.inputSchema>) {
    try {
      const plan = this.generatePlan({
        task_description,
        complexity_level,
        estimated_duration,
        dependencies,
        constraints,
        success_criteria,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: plan,
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

  private generatePlan({
    task_description,
    complexity_level,
    estimated_duration,
    dependencies,
    constraints,
    success_criteria,
  }: {
    task_description: string;
    complexity_level: "low" | "medium" | "high";
    estimated_duration?: string;
    dependencies: string[];
    constraints: string[];
    success_criteria: string[];
  }): string {
    const steps = this.generateSteps(task_description, complexity_level);
    const risks = this.identifyRisks(task_description, complexity_level);

    let plan = `# 📋 Task Plan: ${task_description}\n\n`;

    // Task Overview
    plan += `## 🎯 Task Overview\n`;
    plan += `- **Objective**: ${task_description}\n`;
    plan += `- **Complexity**: ${complexity_level.toUpperCase()}\n`;
    if (estimated_duration) {
      plan += `- **Estimated Duration**: ${estimated_duration}\n`;
    }
    plan += `\n`;

    // Prerequisites
    if (dependencies.length > 0) {
      plan += `## 📋 Prerequisites\n`;
      dependencies.forEach((dep, index) => {
        plan += `${index + 1}. ${dep}\n`;
      });
      plan += `\n`;
    }

    // Constraints
    if (constraints.length > 0) {
      plan += `## ⚠️ Constraints & Limitations\n`;
      constraints.forEach((constraint, index) => {
        plan += `${index + 1}. ${constraint}\n`;
      });
      plan += `\n`;
    }

    // Main Steps
    plan += `## 🚀 Step-by-Step Plan\n`;
    steps.forEach((step, index) => {
      plan += `### Step ${index + 1}: ${step.title}\n`;
      plan += `- **Description**: ${step.description}\n`;
      if (step.substeps.length > 0) {
        plan += `- **Sub-tasks**:\n`;
        step.substeps.forEach((substep, subIndex) => {
          plan += `  ${subIndex + 1}. ${substep}\n`;
        });
      }
      if (step.validation) {
        plan += `- **Validation**: ${step.validation}\n`;
      }
      plan += `- **Status**: ⏳ Pending\n\n`;
    });

    // Risk Assessment
    if (risks.length > 0) {
      plan += `## ⚠️ Risk Assessment & Mitigation\n`;
      risks.forEach((risk, index) => {
        plan += `${index + 1}. **Risk**: ${risk.risk}\n`;
        plan += `   - **Mitigation**: ${risk.mitigation}\n`;
      });
      plan += `\n`;
    }

    // Success Criteria
    if (success_criteria.length > 0) {
      plan += `## ✅ Success Criteria\n`;
      success_criteria.forEach((criteria, index) => {
        plan += `${index + 1}. ${criteria}\n`;
      });
    } else {
      plan += `## ✅ Success Criteria\n`;
      plan += `1. All planned steps completed successfully\n`;
      plan += `2. Task objective achieved as described\n`;
      plan += `3. No critical errors or issues remaining\n`;
    }

    plan += `\n---\n`;
    plan += `**Plan Status**: 🆕 Created | **Progress**: 0% Complete\n`;

    return plan;
  }

  private generateSteps(
    task_description: string,
    complexity_level: "low" | "medium" | "high"
  ): Array<{
    title: string;
    description: string;
    substeps: string[];
    validation?: string;
  }> {
    // This is a simplified step generation - in a real implementation,
    // you might use more sophisticated analysis or LLM integration
    const isFileTask = task_description.toLowerCase().includes("file");
    const isCodeTask = task_description.toLowerCase().includes("code") || 
                      task_description.toLowerCase().includes("implement") ||
                      task_description.toLowerCase().includes("develop");
    const isConfigTask = task_description.toLowerCase().includes("config") ||
                        task_description.toLowerCase().includes("setup");

    const steps = [];

    // Planning phase
    const planningSubsteps = [
      "Review task description and requirements",
      "Identify all necessary resources and tools",
      "Create detailed specifications",
    ];
    
    if (complexity_level === "high") {
      planningSubsteps.push("Break down into smaller sub-tasks");
      planningSubsteps.push("Identify potential bottlenecks and dependencies");
    }
    
    planningSubsteps.push("Validate approach with stakeholders if needed");

    steps.push({
      title: "Analysis & Planning",
      description: "Analyze the task requirements and create detailed specifications",
      substeps: planningSubsteps,
      validation: "Requirements are clearly defined and understood",
    });

    // Task-specific steps based on content analysis
    if (isFileTask) {
      steps.push({
        title: "File System Preparation",
        description: "Prepare the file system and identify target files",
        substeps: [
          "Locate and verify target files/directories",
          "Create backups if necessary",
          "Check file permissions and access rights",
        ],
        validation: "All files are accessible and backups created",
      });
    }

    if (isCodeTask) {
      steps.push({
        title: "Code Implementation",
        description: "Implement the required code changes or new functionality",
        substeps: [
          "Set up development environment",
          "Write/modify code according to specifications",
          "Follow coding standards and best practices",
          "Add appropriate comments and documentation",
        ],
        validation: "Code compiles/runs without errors",
      });

      steps.push({
        title: "Testing & Validation",
        description: "Test the implemented solution thoroughly",
        substeps: [
          "Run unit tests",
          "Perform integration testing",
          "Validate against requirements",
          "Check for edge cases and error handling",
        ],
        validation: "All tests pass and requirements are met",
      });
    }

    if (isConfigTask) {
      steps.push({
        title: "Configuration Setup",
        description: "Configure the system or application settings",
        substeps: [
          "Review current configuration",
          "Apply new configuration settings",
          "Validate configuration syntax",
          "Test configuration changes",
        ],
        validation: "Configuration is valid and working as expected",
      });
    }

    // Generic implementation step for other tasks
    if (!isFileTask && !isCodeTask && !isConfigTask) {
      steps.push({
        title: "Implementation",
        description: "Execute the main task implementation",
        substeps: [
          "Follow the planned approach",
          "Monitor progress and adjust as needed",
          "Document any issues or deviations",
        ],
        validation: "Implementation matches planned specifications",
      });
    }

    // Final validation and cleanup
    steps.push({
      title: "Final Validation & Cleanup",
      description: "Perform final checks and clean up any temporary resources",
      substeps: [
        "Verify all success criteria are met",
        "Clean up temporary files or resources",
        "Document the completed work",
        "Prepare final deliverables",
      ],
      validation: "Task is complete and all criteria satisfied",
    });

    return steps;
  }

  private identifyRisks(
    task_description: string,
    complexity_level: "low" | "medium" | "high"
  ): Array<{ risk: string; mitigation: string }> {
    const risks = [];

    // Complexity-based risks
    if (complexity_level === "high") {
      risks.push({
        risk: "Task complexity may lead to unexpected challenges",
        mitigation: "Break down into smaller, manageable sub-tasks and validate each step",
      });
    }

    // File-related risks
    if (task_description.toLowerCase().includes("file")) {
      risks.push({
        risk: "File corruption or data loss during operations",
        mitigation: "Create backups before making changes and validate file integrity",
      });
    }

    // Code-related risks
    if (task_description.toLowerCase().includes("code")) {
      risks.push({
        risk: "Code changes may introduce bugs or break existing functionality",
        mitigation: "Implement comprehensive testing and use version control",
      });
    }

    // Time-related risks
    if (complexity_level === "high") {
      risks.push({
        risk: "Task may take significantly longer than estimated due to complexity",
        mitigation: "Add buffer time and break into smaller milestones with regular check-ins",
      });
    } else {
      risks.push({
        risk: "Task may take longer than estimated",
        mitigation: "Monitor progress regularly and adjust timeline as needed",
      });
    }

    // Dependency risks
    risks.push({
      risk: "External dependencies may not be available or compatible",
      mitigation: "Verify all dependencies early and have fallback options",
    });

    return risks;
  }
}