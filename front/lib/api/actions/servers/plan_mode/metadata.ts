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
      "skeleton. This is the primary way to give the user visibility on your work: the plan " +
      "stays live and they can follow along.\n\n" +
      "**Default to calling this at the start of any non-trivial turn.** Non-trivial means: " +
      "multi-step work, anything touching several files or systems, research that will span " +
      "multiple tool calls, anything the user might plausibly want to follow along with. When " +
      "in doubt, call it — the cost is one tool call, the upside is transparency.\n\n" +
      "**Do NOT call** for single-shot questions, quick lookups, one-tool-call answers, pure " +
      "clarification exchanges, or when a plan already exists in the conversation. Exactly one " +
      "active plan is allowed per conversation; call `close_plan` to retire the current one " +
      "first if the user wants a fresh plan.\n\n" +
      "After creating, immediately populate the skeleton via `edit_plan`. Keep editing as you " +
      "work: check off tasks with `- [x]`, add tasks that emerge, update the approach.\n\n" +
      "**Approval is optional.** If the user EXPLICITLY asked for plan mode (e.g. 'use plan " +
      "mode', 'plan this for me', 'draft a plan before you do anything'), you MUST call " +
      "`request_plan_approval` once the plan is populated and before starting execution. " +
      "Otherwise (agent-initiated planning for transparency), skip approval and just keep " +
      "editing the plan as you execute.",
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
      "times, the edit fails and you must retry with a more specific string.\n\n" +
      "Use this liberally. During drafting, to flesh out the plan. During execution, to check " +
      "off tasks with `- [x]`, mark blocked tasks with `- [!]`, or adjust the approach.\n\n" +
      "A freshly-created plan.md (via `create_plan`) contains this exact skeleton you need to " +
      "populate with your first edits:\n\n" +
      "```markdown\n" +
      PLAN_MODE_SKELETON +
      "```",
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
      "Ask the user to approve the current plan before you proceed. Optional — only call when " +
      "the stakes warrant an explicit human checkpoint (irreversible actions, big scope, " +
      "ambiguous intent, etc.). For transparency-only flows, skip this and just keep `edit_plan`-" +
      "ing as you work.\n\n" +
      "The user will see an approval card and either approve or reject.\n\n" +
      "**If approved**: proceed with execution; keep updating plan.md via `edit_plan` as you " +
      "work.\n\n" +
      "**If REJECTED (tool result status: denied)**: STOP. Do NOT proceed with execution. Do " +
      "NOT call any research, side-effect, or write tools. Your next step MUST be to call " +
      "`ask_user_question` to ask the user what to change, offering options like: a concrete " +
      "revision direction, 'proceed anyway without approval', or 'drop the plan'. Based on the " +
      "user's answer: if they give you a revision, revise via `edit_plan` and call " +
      "`request_plan_approval` again. If they say to proceed anyway, you may continue " +
      "execution without re-requesting approval (keep updating plan.md via `edit_plan` for " +
      "transparency). If they ask to drop the plan, call `close_plan`.\n\n" +
      "Only call when plan.md is ready. Do not call with an incomplete plan.",
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
      "Retire the current plan. Call this when the user explicitly asks to drop the plan or " +
      "abandon the task entirely (e.g. 'never mind', 'let's drop this', 'forget about the " +
      "plan').\n\n" +
      "After close_plan, the plan is hidden from the UI and this skill will not reference it " +
      "again. You can call `create_plan` to start a fresh plan if the user later asks for one.\n\n" +
      "Do NOT use close_plan to handle simple plan revisions — use `edit_plan` to iterate on " +
      "the plan instead. Close is terminal; use it sparingly.",
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
