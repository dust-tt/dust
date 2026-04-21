import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const PLAN_MODE_SERVER_NAME = "plan_mode" as const;

export const ENTER_PLAN_MODE_TOOL_NAME = "enter_plan_mode" as const;
export const EDIT_PLAN_TOOL_NAME = "edit_plan" as const;
export const EXIT_PLAN_MODE_TOOL_NAME = "exit_plan_mode" as const;

export const PLAN_MODE_TOOLS_METADATA = createToolsRecord({
  enter_plan_mode: {
    description:
      "Enter plan mode. Creates a `plan.md` file attached to the conversation (seeded with a " +
      "Context + Tasks skeleton) and switches the conversation into a read-only planning phase. " +
      "The user gets an approvable artifact before you execute.\n\n" +
      "**CALL THIS TOOL — do not write a plan as a chat message.** If the user asks for plan " +
      "mode (e.g. 'use plan mode', 'plan this for me', 'draft a plan first'), call this tool " +
      "immediately as your first action. Do not acknowledge in text, do not ask questions first, " +
      "do not outline the plan in a chat response — call the tool. Clarifying questions go " +
      "inside plan mode via `ask_user_question`, not before.\n\n" +
      "Also call this tool, even without explicit user request, when:\n" +
      "- The task is multi-step, touches multiple files/systems, or involves irreversible or " +
      "externally-visible side effects.\n" +
      "- The ask is ambiguous enough that guessing wrong would cost meaningful work.\n\n" +
      "Do NOT call this tool for trivial lookups, single-question research, or simple read-only " +
      "asks.\n\n" +
      "Inside plan mode, the only write tool is `edit_plan`; you can also browse, search, and " +
      "use `ask_user_question`. Every turn must end with either `ask_user_question` or " +
      "`exit_plan_mode`.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Entering plan mode",
      done: "Entered plan mode",
    },
  },
  edit_plan: {
    description:
      "Edit the conversation's `plan.md` by replacing `old_string` with `new_string`. The full " +
      "updated contents of plan.md are returned so you can see your change.\n\n" +
      "`old_string` must match exactly once in the current file. If it matches zero or multiple " +
      "times, the edit fails and you must retry with a more specific string.\n\n" +
      "Use this both while planning (to draft the plan) and while executing (to check off tasks " +
      "with `- [x]`, mark blocked tasks with `- [!]`, or update the plan as the approach " +
      "evolves).",
    schema: {
      old_string: z
        .string()
        .describe(
          "The exact string in plan.md to replace. Must match exactly once."
        ),
      new_string: z
        .string()
        .describe(
          "The replacement string. Use an empty string to delete `old_string`."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Editing plan.md",
      done: "Edited plan.md",
    },
  },
  exit_plan_mode: {
    description:
      "Exit plan mode and surface the plan to the user for approval. Call this once `plan.md` " +
      "is complete and you are ready to execute.\n\n" +
      "The user will see an approval card and either approve (you will then proceed to " +
      "execution) or reject (you will stay in plan mode and iterate based on their feedback).\n\n" +
      "Only call when plan.md is ready. Do not call it with an incomplete plan.",
    schema: {
      summary: z
        .string()
        .optional()
        .describe(
          "Optional one-sentence TL;DR shown to the user as the body of the approval card. " +
            "Provide it when the plan is long enough that a one-liner helps the user decide at a " +
            "glance; omit for short plans."
        ),
    },
    // `high` routes the tool through the existing MCP tool-approval machinery: the workflow
    // exits cleanly with the action in `blocked_validation_required`, the UI renders an approval
    // card, and on approve the tool handler actually runs (capturing the approval on plan.md and
    // flipping the conversation out of plan mode). On reject, the handler does not run.
    stake: "high",
    displayLabels: {
      running: "Requesting plan approval",
      done: "Plan approved",
    },
  },
});

export const PLAN_MODE_SERVER = {
  serverInfo: {
    name: PLAN_MODE_SERVER_NAME,
    version: "1.0.0",
    description:
      "Enter a structured planning phase for non-trivial tasks. The agent drafts a plan.md " +
      "for the user to review and approve before execution begins.",
    icon: "ActionDocumentTextIcon" as const,
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(PLAN_MODE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(PLAN_MODE_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
