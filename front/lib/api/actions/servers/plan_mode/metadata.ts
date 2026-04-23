import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Initial content seeded into plan.md on create_plan.
export const PLAN_MODE_SKELETON = `# Untitled plan

## Context
_Fill in: why we're doing this, what the user asked for._

## Tasks
- [ ] _Fill in the first task_
`;

export const PLAN_MODE_SERVER_NAME = "plan_mode" as const;

export const CREATE_PLAN_TOOL_NAME = "create_plan" as const;
export const EDIT_PLAN_TOOL_NAME = "edit_plan" as const;
export const REQUEST_PLAN_APPROVAL_TOOL_NAME = "request_plan_approval" as const;
export const CLOSE_PLAN_TOOL_NAME = "close_plan" as const;

export const PLAN_MODE_TOOLS_METADATA = createToolsRecord({
  create_plan: {
    description:
      "Create a `plan.md` file attached to this conversation, seeded with a Context + Tasks " +
      "skeleton. Exactly one active plan is allowed per conversation; call `close_plan` to " +
      "retire the current one first if the user wants a fresh plan. After creating, populate " +
      "the skeleton via `edit_plan`.\n\n" +
      "See skill instructions for when to call this and the end-to-end workflow.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Creating plan",
      done: "Plan created",
    },
  },
  edit_plan: {
    description:
      "Edit the active `plan.md` by replacing `old_string` with `new_string`. The full updated " +
      "contents of plan.md are returned so you can see your change.\n\n" +
      "`old_string` must match exactly once in the current file. If it matches zero or multiple " +
      "times, the edit fails and you must retry with a more specific string. Use an empty " +
      "`new_string` to delete `old_string`.\n\n" +
      "A freshly-created plan.md (via `create_plan`) contains this exact skeleton you need to " +
      "populate with your first edits:\n\n" +
      "```markdown\n" +
      PLAN_MODE_SKELETON +
      "```\n\n" +
      "See skill instructions for when to edit and how to use task markers.",
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
      running: "Updating plan",
      done: "Plan updated",
    },
  },
  request_plan_approval: {
    description:
      "Surface the current plan.md to the user and pause execution pending their decision. " +
      "The user sees an approval card and either approves or rejects. On approve, the tool " +
      "returns success and execution resumes. On reject, the tool returns with `denied` status " +
      "and the handler does not run.\n\n" +
      "Only call when plan.md is ready. Do not call with an incomplete plan.\n\n" +
      "See skill instructions for when to request approval and how to handle rejection.",
    schema: {
      summary: z
        .string()
        .optional()
        .describe(
          "Optional one-sentence TL;DR shown to the user as the body of the approval card. " +
            "Provide it when the plan is long enough that a one-liner helps the user decide at " +
            "a glance; omit for short plans."
        ),
    },
    // `high` routes the tool through the existing MCP tool-approval machinery: the workflow exits
    // cleanly with the action in `blocked_validation_required`, the UI renders an approval card,
    // and on approve the tool handler runs (stamping approval onto plan.md). On reject the
    // handler does not run; the agent sees the action as denied and can iterate.
    stake: "high",
    displayLabels: {
      running: "Requesting plan approval",
      done: "Plan approved",
    },
  },
  close_plan: {
    description:
      "Retire the current plan. After close_plan, the plan is hidden from the UI and this " +
      "skill will not reference it again. You can call `create_plan` to start a fresh plan " +
      "later. Close is terminal; use `edit_plan` to iterate on the plan instead of closing it.\n\n" +
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
  },
});

export const PLAN_MODE_SERVER = {
  serverInfo: {
    name: PLAN_MODE_SERVER_NAME,
    version: "1.0.0",
    description:
      "Create and maintain a living `plan.md` that gives the user visibility on non-trivial " +
      "work. Optionally surface the plan for explicit user approval before proceeding.",
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
