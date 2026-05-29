import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  LIST_MEMBERS_TOOL_NAME,
  POD_MANAGER_SERVER_NAME,
  UPDATE_MEMBERS_TOOL_NAME,
} from "@app/lib/api/actions/servers/pod_manager/metadata";
import {
  POD_TASKS_SERVER_NAME,
  START_TASK_AGENT_TOOL_NAME,
} from "@app/lib/api/actions/servers/pod_tasks/metadata";

/** Seeded via POST /pods/:podId/tasks/seed (editors only). */
export const PROJECT_MANAGER_AGENT_SID = "project_manager" as const;

const NEXT_TASK_PROMPT = `After the user agrees to mark this task done, check what other tasks are still open in the Pod. Propose tackling the most relevant next open one to the user. If they agree, use \`${getPrefixedToolName(POD_TASKS_SERVER_NAME, START_TASK_AGENT_TOOL_NAME)}\` to kick off a conversation for it and share the conversation link in your reply.`;

export const INITIAL_POD_TASKS: {
  text: string;
  agentInstructions: string;
}[] = [
  {
    text: "🎯 Set up the Pod description and goals",
    agentInstructions:
      "Help the user refine a short Pod description and clear goals. Use Pod tools to read or update Pod metadata if available. Propose concrete edits; keep the tone practical and brief.\n\n" +
      NEXT_TASK_PROMPT,
  },
  {
    text: "📚 Bring in knowledge from company data",
    agentInstructions:
      "When it matches the Pod's purpose, do a substantive pass over company data (search / retrieval across workspace sources and connected systems—not just a single quick lookup). Synthesize what matters, cite where it came from, then help store it in Pod knowledge using Pod tools (files, uploads, or structured notes). Skip deep dives when context isn't needed yet.\n\n" +
      NEXT_TASK_PROMPT,
  },
  {
    text: "👥 Search for and add Pod members",
    agentInstructions:
      `Help the user identify the right collaborators for this Pod. Use people search or directory tools to find candidates by name, role, team, or expertise. Present the shortlist to the user and, once they confirm, add the selected people to the Pod using the Pod \`${getPrefixedToolName(POD_MANAGER_SERVER_NAME, UPDATE_MEMBERS_TOOL_NAME)}\` tool. Use \`${getPrefixedToolName(POD_MANAGER_SERVER_NAME, LIST_MEMBERS_TOOL_NAME)}\` first if you need to check who is already on the Pod.\n\n` +
      NEXT_TASK_PROMPT,
  },
  {
    text: "📋 Build a list of initial tasks",
    agentInstructions:
      "Partner with the user to produce a practical starter backlog for this Pod: concrete next steps, early milestones, dependencies, and risks to watch. Keep items actionable; offer wording they can turn into tasks. This list shapes follow-on work—don't recycle these seeded items verbatim.\n\n" +
      NEXT_TASK_PROMPT,
  },
];
