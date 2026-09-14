import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

const PLAN_MODE_SKELETON = `# <plan title>

## Context
_Why we're doing this, what the user asked for._

## Tasks
1. [ ] _First task_
`;

export const PLAN_MODE_SERVER_NAME = "plan_mode" as const;

export const CREATE_PLAN_TOOL_NAME = "create_plan" as const;
export const EDIT_PLAN_TOOL_NAME = "edit_plan" as const;
export const CLOSE_PLAN_TOOL_NAME = "close_plan" as const;

export const PLAN_FILE_NAME = "plan.md" as const;

export const PLAN_MODE_TOOLS_METADATA = [
  {
    name: "create_plan",
    description:
      `Create the conversation's \`${PLAN_FILE_NAME}\` with the markdown you pass as \`content\`. Write the ` +
      "full plan directly; do not create an empty plan and then edit it. Exactly one active " +
      `plan is allowed per conversation; call \`${CLOSE_PLAN_TOOL_NAME}\` to retire the current one first if ` +
      `the user wants a fresh plan. Use \`${EDIT_PLAN_TOOL_NAME}\` for subsequent updates.\n\n` +
      "Recommended structure:\n\n" +
      "```markdown\n" +
      PLAN_MODE_SKELETON +
      "```\n\n" +
      "See skill instructions for when to call this and the end-to-end workflow.",
    schema: {
      content: z
        .string()
        .describe(
          "The full markdown content of the plan. Use a `# title`, a `## Context` section, and " +
            "a `## Tasks` numbered checklist (`1. [ ]` items)."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Creating plan",
      done: "Plan created",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "edit_plan",
    description:
      `Edit the active \`${PLAN_FILE_NAME}\` by replacing \`old_string\` with \`new_string\`. The full updated ` +
      `contents of ${PLAN_FILE_NAME} are returned so you can see your change.\n\n` +
      "`old_string` must match exactly once in the current file. If it matches zero or multiple " +
      "times, the edit fails and you must retry with a more specific string. Use an empty " +
      "`new_string` to delete `old_string`.\n\n" +
      "See skill instructions for when to edit and how to use task markers.",
    schema: {
      old_string: z
        .string()
        .describe(
          `The exact string in ${PLAN_FILE_NAME} to replace. Must match exactly once.`
        ),
      new_string: z
        .string()
        .describe(
          "The replacement string. Use an empty string to delete `old_string`."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Updating plan",
      done: "Plan updated",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "close_plan",
    description:
      `Retire the current plan. After ${CLOSE_PLAN_TOOL_NAME}, the plan is hidden from the UI and this ` +
      `skill will not reference it again. You can call \`${CREATE_PLAN_TOOL_NAME}\` to start a fresh plan ` +
      `later. Close is terminal; use \`${EDIT_PLAN_TOOL_NAME}\` to iterate on the plan instead of closing it.\n\n` +
      "See skill instructions for when to call this.",
    schema: {
      reason: z
        .string()
        .optional()
        .describe(
          "Optional one-sentence note about why the plan was closed. Not shown to the user; " +
            "recorded for audit only."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Closing plan",
      done: "Plan closed",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const PLAN_MODE_SERVER = {
  serverInfo: {
    name: PLAN_MODE_SERVER_NAME,
    version: "1.0.0",
    description:
      `Create and maintain a living \`${PLAN_FILE_NAME}\` that gives the user visibility on genuinely ` +
      "multi-step work. When you need explicit sign-off before proceeding, ask the user with the " +
      "standard question flow.",
    icon: "ActionDocumentTextIcon" as const,
    authorization: null,
    documentationUrl: null,
  },
  tools: PLAN_MODE_TOOLS_METADATA,
} as const satisfies ServerMetadata;
