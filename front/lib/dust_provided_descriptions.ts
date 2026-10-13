import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerType } from "@app/lib/api/mcp";
import type { GlobalSkillId } from "@app/lib/resources/skill/code_defined/global_registry";
import type { SystemSkillId } from "@app/lib/resources/skill/code_defined/system_registry";
import {
  GLOBAL_AGENTS_SID,
  isGlobalAgentId,
} from "@app/types/assistant/assistant";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

type Translate = (descriptor: MessageDescriptor) => string;

/**
 * @cc [owner:sfriquet,label:product] english-matches-source
 * The English message of every descriptor MUST equal the description the server returns for its
 * global agent (checked by `dust_provided_descriptions.test.ts`), so that `en-US` renders
 * the source text and no locale renders a translation of a stale description.
 */
const GLOBAL_AGENT_DESCRIPTIONS: Partial<
  Record<GLOBAL_AGENTS_SID, MessageDescriptor>
> = {
  [GLOBAL_AGENTS_SID.DUST]: msg`An agent with context on your company data.`,
  [GLOBAL_AGENTS_SID.DUST_LEAN]: msg`Dust with no tools, skills, or company knowledge by default. Add capabilities to the conversation as needed.`,
  [GLOBAL_AGENTS_SID.DEEP_DIVE]: msg`Conducts comprehensive, in-depth analysis across all company data, databases, and web sources—thorough investigation that may take several minutes.`,
  [GLOBAL_AGENTS_SID.HELPER]: msg`Help on how to use Dust`,
  [GLOBAL_AGENTS_SID.ANALYST]: msg`Agent for admins and managers that answers questions about how your workspace is being used.`,
};

/**
 * @cc [owner:sfriquet,label:product] english-matches-source
 * The English message of every descriptor MUST equal the description the server returns for its
 * code-defined skill (checked by `dust_provided_descriptions.test.ts`), so that `en-US` renders
 * the source text and no locale renders a translation of a stale description.
 */
const CODE_DEFINED_SKILL_DESCRIPTIONS: Record<
  GlobalSkillId | SystemSkillId,
  MessageDescriptor
> = {
  dust_learning: msg`Get a recommendation for the next best action to get more value from Dust`,
  "conversational-building": msg`Let this agent propose improvements to your Skills from a conversation, as suggestions for their editors to review.`,
  docx: msg`Read, edit, and create text documents (.docx) in the sandbox.`,
  frames: msg`Turn insights into interactive dashboards and presentations your team can explore, customize, and share. Living documents that adapt to different stakeholders.`,
  "go-deep": msg`Enable comprehensive analysis across company data, databases, and web sources — thorough analysis that may take several minutes.`,
  dust_pod_goal: msg`Keep a Pod’s job moving with the next evidence-backed action`,
  markdown_documents: msg`Write and edit Markdown documents that open in the editor, with images from the conversation or pod, and answer their comments.`,
  mention_users: msg`Allow agents to mention and notify workspace users in conversations.`,
  pdf: msg`Read, OCR scans, extract text and tables, create, and edit PDFs in the Computer.`,
  pptx: msg`Read, edit, and create slide presentations`,
  projects: msg`Allow agents to create conversations & messages in Pods, leverage Pods knowledge.`,
  sandbox: msg`Run code, scripts, and shell commands in the conversation’s Computer (a sandboxed Linux environment).`,
  "sheet-to-frame": msg`Turn a data-entry spreadsheet into a real app: a form that fills in the obvious, formulas that become fields nobody types, and your existing rows carried over.`,
  "skill-authoring": msg`Deprecated: use the "Build Agents and Skills" skill instead. Let this agent create and refine reusable Skills for your workspace.`,
  support: msg`Get help with Dust using public docs, open-source issues, and community knowledge.`,
  "workspace-analytics": msg`Analyze how your workspace is used: who and what consumes credits and drives activity, headline figures, and trends over time.`,
  xlsx: msg`Read, edit, and create spreadsheets (.xlsx, .csv)`,
  discover_knowledge: msg`Search across all your company documents and data warehouses to surface the information you need without manual configuration.`,
  discover_skills: msg`Automatically discover and activate workspace skills as needed.`,
  discover_tools: msg`Automatically discover and activate specialized tools as needed. Extend your agent’s capabilities on-demand without manual configuration.`,
  plan_mode: msg`Let agents maintain a live plan.md the user can follow as work progresses.`,
  user_memory: msg`Give agents a persistent memory of the user’s preferences and context across conversations.`,
};

/**
 * @cc [owner:sfriquet,label:product] english-matches-source
 * The English message of every descriptor MUST equal the description the server returns for its
 * internal MCP server (checked by `dust_provided_descriptions.test.ts`), so that `en-US` renders
 * the source text and no locale renders a translation of a stale description.
 */
const INTERNAL_MCP_SERVER_DESCRIPTIONS: Record<
  InternalMCPServerNameType,
  MessageDescriptor | null
> = {
  github: msg`Manage issues, pull requests, and discussions.`,
  image_generation: msg`Generate, create, draw, or edit images from text prompts and optional reference images.`,
  "web_search_&_browse": msg`Agent can search (Google) and retrieve information from specific websites.`,
  hubspot: msg`Access CRM contacts, deals and customer activities.`,
  agent_router: msg`Tools with access to the agents of the workspace.`,
  include_data: msg`Load complete content for full context up to memory limits. Note: won’t include spreadsheet/table data.`,
  run_dust_app: msg`Run Dust Apps with specified parameters.`,
  notion: msg`Access workspace pages, databases and datasources.`,
  extract_data: msg`Parse documents to create structured datasets.`,
  missing_action_catcher: msg`To be used to catch errors and avoid erroring.`,
  salesforce: msg`Salesforce tools.`,
  gmail: msg`Read and send Gmail emails: manage inbox messages, threads, drafts, labels, and attachments.`,
  google_calendar: msg`Manage Google Calendar: list calendars, create and update meeting events, check free/busy availability, and look up attendee timezones.`,
  conversation_files: msg`List, read, and semantically search files and content nodes attached to the conversation.`,
  slack: msg`Slack tools for searching and posting messages. Works with your personal Slack account and supports all common Slack operations.`,
  google_sheets: msg`Work with spreadsheet data and tables.`,
  monday: msg`Interact with Monday.com boards, items, and workflows. Manage tasks, track projects, and automate CRM workflows.`,
  agent_memory: msg`User-scoped long-term memory tools for agents.`,
  jira: msg`Create, update and track project issues.`,
  interactive_content: msg`Create dashboards, presentations, or any interactive content.`,
  outlook: msg`Read and send Outlook emails (Microsoft 365): manage inbox messages, drafts, mail folders, contacts, and shared mailboxes.`,
  outlook_calendar: msg`Manage Outlook Calendar (Microsoft 365): list calendars, create and update meeting events, check free/busy availability.`,
  freshservice: msg`Manage Freshservice IT service desk tickets, service requests, knowledge base articles, and service catalog items. An ITSM (IT Service Management) helpdesk platform.`,
  google_drive: msg`Search, read, create, clone, edit, comment on, and manage permissions for files in Google Drive (Docs, Sheets, Presentations).`,
  slack_bot: msg`Specialized Slack bot integration for posting messages as the workspace bot. Limited to channels where the bot has been added.`,
  confluence: msg`Retrieve page information.`,
  speech_generator: msg`Turn written text into spoken audio or dialogue`,
  microsoft_drive: msg`Search, read, and upload files in Microsoft OneDrive and SharePoint.`,
  microsoft_teams: msg`Microsoft Teams for searching and posting messages.`,
  sound_studio: msg`Create music tracks and sound effects`,
  microsoft_excel: msg`Read and write Excel spreadsheets in Microsoft OneDrive and SharePoint.`,
  http_client: msg`Make HTTP requests to external APIs with optional Bearer token authentication.`,
  ashby: msg`Access and manage Ashby ATS (applicant tracking system) data for recruiting: candidates, job postings, interview feedback, referrals, and hiring.`,
  salesloft: msg`Access Salesloft sales cadences (outreach sequences), tasks, and due actions for sales engagement and pipeline outreach.`,
  zendesk: msg`Access and manage support tickets, help center, and customer interactions.`,
  slab: msg`Search and read from your Slab knowledge base`,
  vanta: msg`Review compliance posture powered by Vanta’s security platform.`,
  productboard: msg`Manage Productboard product management data: features, initiatives, roadmaps, OKRs, customer feedback notes, companies, and product hierarchy entities.`,
  snowflake: msg`Execute read-only SQL queries and browse schema in Snowflake.`,
  ukg_ready: msg`Manage employee time-off requests, schedules, and accrual balances in UKG Ready.`,
  statuspage: msg`Monitor and manage Atlassian Statuspage incidents.`,
  luma: msg`Manage Luma events, guests, and attendance insights.`,
  fathom: msg`Access Fathom meeting recordings, transcripts, summaries, and action items.`,
  gong: msg`Access Gong sales calls, transcripts, conversation analytics, and revenue intelligence for deal coaching and pipeline review.`,
  search: msg`Search content whose meaning best matches your message (not suited for analytics).`,
  run_agent: msg`Run a child agent (agent as tool).`,
  query_tables_v2: msg`Query structured data like a spreadsheet or database. Use list_tables to discover available tables, get_database_schema for the tables you need, then execute_database_query to run SQL analyses.`,
  data_sources_file_system: msg`Browse and search content with filesystem-like navigation.`,
  data_warehouses: msg`Browse tables organized by warehouse and schema.`,
  toolsets: msg`Browse available toolsets and functions.`,
  val_town: msg`Create and manage Val Town vals: serverless TypeScript/JavaScript functions, HTTP endpoints, email handlers, and scheduled scripts.`,
  common_utilities: msg`Conversation helpers (titles, mark read), random numbers, timers, and other common utilities.`,
  front: msg`Manage support conversations, messages, and customer interactions.`,
  skill_management: null,
  skill_authoring: msg`Create and update reusable workspace Skills.`,
  triggers_management: msg`Create schedules and event triggers to automate recurring and event-driven tasks.`,
  pod_manager: msg({
    message:
      "Manage Pod metadata, members, conversations, and Company Data references. Raw Pod file operations (create, read, search, write, delete) live in the `files` MCP server under `pod-<id>/<rel>` scoped paths.",
  }),
  pod_tasks: msg`Manage Pod tasks: list, create, update, and complete action items.`,
  agent_sidekick_context: msg`Retrieve context about available models, skills, tools, and agent-specific feedback and insights. Create and manage suggestions for agent configuration changes.`,
  agent_sidekick_agent_state: msg`Retrieve information about the current agent’s configuration, including name, description, instructions, model, and tools.`,
  sandbox: msg`Execute code and commands in the conversation’s Computer (an isolated Linux environment).`,
  user_mentions: msg`Tools for mentioning users in conversations.`,
  poke: null,
  ask_user_question: msg`Ask the user a question with multiple-choice options.`,
  wakeups: msg`Schedule wake-ups that re-invoke the agent at a later time.`,
  clari_copilot: msg`Access Clari Copilot call transcripts, AI summaries, and action items.`,
  plan_mode: msg({
    message:
      "Create and maintain a living `plan.md` that gives the user visibility on genuinely multi-step work. When you need explicit sign-off before proceeding, ask the user with the standard question flow.",
  }),
  files: msg({
    message:
      "File system interface for the agent loop conversation and any accessible conversation or Pod. Defaults to the current conversation (and its Pod when applicable). Files include user uploads, sandbox outputs, and tool results. Scoped paths such as `conversation-<id>/chart.png` or `pod-<id>/spec.md` identify files and can be used to reference or display them in responses. Processed siblings (resized images, audio transcripts) are listed alongside their source with an annotation.",
  }),
  documents: msg`Collaborate on Markdown documents in the file system alongside their human editors.`,
  workspace_analytics: msg`Workspace usage analytics for admins and managers: credit consumption, message and execution volume by entity, headline figures, and trends over time.`,
  workspace_management: msg`Search the workspace’s agents and skills, and inventory tools, tags and groups.`,
  exa_people_and_company: msg`Search for people and companies using Exa’s AI-powered search.`,
  user_analytics: msg`Fetch personal usage stats and anonymized workspace activity data.`,
  activation_recommendations: msg`Track activation recommendations and record user decisions on them.`,
  agent_templates: msg`Search and retrieve agent templates.`,
  servicenow: msg`Read and manage records in ServiceNow.`,
  shopify: msg`Access catalog, customers and orders data from a Shopify store.`,
  user_memory: msg`Store and retrieve the current user’s personal memory, shared across the user’s agents.`,
  agent_delegation: msg`Run an accessible workspace agent by ID.`,
  building_agents_and_skills: msg`Build and improve agents and skills from a conversation by proposing suggestions their editors can review.`,
  cursor_cloud_agents: msg`Launch, manage, and inspect Cursor Cloud Agents, coding runs, repositories, models, usage, and artifacts.`,
  self_configuration: msg`Let the agent adjust its own configuration mid-conversation.`,
};

function isCodeDefinedSkillId(
  sId: string
): sId is GlobalSkillId | SystemSkillId {
  return Object.hasOwn(CODE_DEFINED_SKILL_DESCRIPTIONS, sId);
}

/**
 * @cc [owner:sfriquet,label:product] display-only
 * The returned description MUST only be rendered to the user: it MUST NOT be sent to a model or
 * written back to the server.
 */
export function getAgentDisplayDescription(
  t: Translate,
  agent: { sId: string; description: string }
): string {
  const descriptor = isGlobalAgentId(agent.sId)
    ? GLOBAL_AGENT_DESCRIPTIONS[agent.sId]
    : undefined;
  return descriptor ? t(descriptor) : agent.description;
}

/**
 * @cc [owner:sfriquet,label:product] display-only
 * The returned description MUST only be rendered to the user: it MUST NOT be sent to a model or
 * written back to the server.
 */
export function getSkillDisplayDescription(
  t: Translate,
  skill: { sId: string; userFacingDescription: string }
): string {
  return isCodeDefinedSkillId(skill.sId)
    ? t(CODE_DEFINED_SKILL_DESCRIPTIONS[skill.sId])
    : skill.userFacingDescription;
}

/**
 * @cc [owner:sfriquet,label:product] display-only
 * The returned description MUST only be rendered to the user: it MUST NOT be sent to a model or
 * written back to the server.
 */
export function getMCPServerDisplayDescription(
  t: Translate,
  server: Pick<MCPServerType, "sId" | "description">
): string {
  const r = getInternalMCPServerNameAndWorkspaceId(server.sId);
  const descriptor = r.isOk()
    ? INTERNAL_MCP_SERVER_DESCRIPTIONS[r.value.name]
    : null;
  return descriptor ? t(descriptor) : server.description;
}

/**
 * @cc [owner:sfriquet,label:product] custom-view-description-untranslated
 * A view's own `description`, set by an admin, MUST be returned as is: only the default
 * description of an internal MCP server is translated.
 */
/**
 * @cc [owner:sfriquet,label:product] display-only
 * The returned description MUST only be rendered to the user: it MUST NOT be sent to a model or
 * written back to the server.
 */
export function getMcpServerViewDisplayDescription(
  t: Translate,
  view: {
    description: string | null;
    server: Pick<MCPServerType, "sId" | "description">;
  }
): string {
  return view.description ?? getMCPServerDisplayDescription(t, view.server);
}
