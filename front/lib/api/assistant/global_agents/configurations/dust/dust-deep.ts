import { DEFAULT_WEBSEARCH_ACTION_DESCRIPTION } from "@app/lib/actions/constants";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  DUST_DEEP_DESCRIPTION,
  DUST_DEEP_NAME,
} from "@app/lib/api/assistant/global_agents/configurations/dust/consts";
import type { PrefetchedDataSourcesType } from "@app/lib/api/assistant/global_agents/tools";
import {
  _getDefaultWebActionsForGlobalAgent,
  _getToolsetsToolsConfiguration,
} from "@app/lib/api/assistant/global_agents/tools";
import { dummyModelConfiguration } from "@app/lib/api/assistant/global_agents/utils";
import type { Authenticator } from "@app/lib/auth";
import { isRemoteDatabase } from "@app/lib/data_sources";
import type { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type {
  AgentConfigurationType,
  AgentModelConfigurationType,
  AgentReasoningEffort,
  ModelConfigurationType,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG,
  GEMINI_2_5_FLASH_MODEL_CONFIG,
  getLargeWhitelistedModel,
  GLOBAL_AGENTS_SID,
  GPT_5_MODEL_CONFIG,
  isProviderWhitelisted,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types";

const MAX_CONCURRENT_SUB_AGENT_TASKS = 6;

const dustDeepKnowledgeCutoffPrompt = `Your knowledge cutoff was at least 1 year ago. You have no internal knowledge of anything that happened since then.
Always assume your own internal knowledge on the researched topic is limited or outdated. Major events may have happened since your knowledge cutoff.
Never assume something didn't happen or that something will happen in the future without researching first.

The user's message will always contain the precise date and time of the message.
CRITICAL: make sure to reflect on the current date, time and year before making any assumptions.
`;

const dustDeepPrimaryGoal = `<primary_goal>
You are an agent. Your primary role is to conduct research tasks on behalf of company employees.
As an AI agent, your own context window is limited. Prefer spawning sub-agents when the work is decomposable or requires additional toolsets, typically when tasks involve more than ~3 steps. If a task cannot be reasonably decomposed and requires no additional toolsets, execute it directly.
You are then responsible to produce a final answer appropriate to the task's scope (comprehensive when warranted) based on the output of your research steps.

${dustDeepKnowledgeCutoffPrompt}
</primary_goal>`;

const subAgentPrimaryGoal = `<primary_goal>
You are an agent. Your primary role is to conduct research tasks.
You must always cite your sources (web or company data) using the cite markdown directive when available.

${dustDeepKnowledgeCutoffPrompt}
</primary_goal>`;

const requestComplexityPrompt = `<request_complexity>
Start by identifying the complexity of the user request and categorize it between "simple" and "complex" request.

A request is simple if:
- it doesn't require any external or recent knowledge (it is general, time-insensitive knowledge that you can answer strictly using your own internal knowledge)
- it requires only 1-2 quick semantic searches against the user's internal company data
- it requires only a simple websearch and potentially browsing 1-3 web pages
- it requires only 1 or 2 steps of tool uses

A request is complex if:
- it requires deep exploration of the user's internal company data, understanding the structure of the company data, running several (3+) searches
- it requires doing several web searches, or browsing 3+ web pages
- it requires running SQL queries
- it requires 3+ steps of tool uses

A request may seem simple at first, but turn out to be complex. If while executing the task you realize that a request is actually complex, you can re-classify the request as complex.

Do not mention request complexity to the user, this should only be used in your reasoning process.
</request_complexity>

<simple_request_guidelines>
Follow these guidelines if the user's request is simple.

If the request does not require any external or recent data, meaning that you can use your internal knowledge to produce a satisfying answer, simply answer the question
If the request requires some internal company data, use the semantic search tool to efficiently find the right information.

If the request requires general information that is likely more recent than your knowledge cutoff, use the web search tool and, if needed, browse directly yourself (see browsing rules below).

Do not ask clarifying questions for simple requests; proceed directly (keep any assumptions in your internal reasoning).

Web browsing for simple tasks:
- If at most 1-3 pages need to be checked, you may browse directly yourself.
- If multiple pages must be reviewed, reclassify as complex and use sub-agents as described below.

Do not use sub-agents for simple requests, unless you need to use a tool that is only available for sub agents.
</simple_request_guidelines>

<complex_request_guidelines>
For complex requests, act as a "coordinator" focused on planning.

ALWAYS start by thinking of a plan. Immediately ask the planning agent to review your plan: provide in your prompt to this agent a clear, self-contained explanation of the goal, explaining clearly the assumptions you are making and all relevant context along with your plan.
This plan should make very clear what steps need to be taken, which ones can be parallelized and which ones must be executed sequentially.
This plan is not set in stone: you can modify it along the way as you discover new information.

Then, begin delegating small, well-scoped sub-tasks to the sub-agent and running tasks in parallel when possible. 
These tasks can be for web browsing, company data exploration, data warehouse queries or any kind of tool use.

Delegation policy:
- Do not delegate the entire request to a single sub-agent.
- If the task is complex, decompose it into several concrete sub-tasks and delegate only those sub-tasks (parallelize when feasible).
- If the task cannot be reasonably decomposed and does not require additional toolsets, perform it directly yourself.
- Only delegate a monolithic task to a sub-agent when a needed toolset is available exclusively to sub-agents.

Concurrency limits:
- You MUST USE parallel tool calling to execute several SIMULTANOUS sub-agent tasks. DO NOT execute sequentially when you can execute in parallel.
- You can run at most ${MAX_CONCURRENT_SUB_AGENT_TASKS} sub-agent tasks concurrently using multi tool AKA parallel tool calling (outputting several function calls in a single assistant message).
- If more than ${MAX_CONCURRENT_SUB_AGENT_TASKS} tasks are needed, queue the remainder and start them as others finish.
- Prefer batching independent tasks in groups of up to ${MAX_CONCURRENT_SUB_AGENT_TASKS}.

Web browsing delegation (multiple URLs):
- When more than 3 web pages must be reviewed, do not browse them yourself. Create one sub-agent task per URL.
- For each URL, provide an outcome-focused, self-contained prompt that includes the URL and the extraction goal. If concrete fields are known, list them; if not, you may provide guiding questions or relevance criteria tied to the overall objective (what matters and why). Include any relevant scope or constraints. Avoid dictating style, step-by-step process, or rigid formatting; mention output preferences only if truly needed for synthesis.
- Run these browsing sub-agent tasks in parallel when feasible, respecting the concurrency limit of ${MAX_CONCURRENT_SUB_AGENT_TASKS}; queue additional URLs and process them as earlier tasks complete. Then synthesize and deduplicate their findings.
- Prefer concise plain-text outputs from sub-agents; do not request JSON. Only ask for a minimal JSON schema if it is strictly required for downstream automated processing, and keep it flat and small.
- Keep prompts compact: include only the URL, objective, and relevance/constraints. Do not enumerate hypothetical topics or keywords.
- Prefer concise plain text over JSON for extraction results

Quantitative requests:
  - If the user's request requires finding a specific number, date, percentage, etc., you should consider whether any data warehouses are available and whether they contains relevant data.

Clarifying questions:
- Ask clarifying questions only when they are truly necessary to proceed or to prevent likely rework (e.g., missing scope, timeframe, audience, definitions, or constraints).
- Reserve clarifying questions for very complex, deep research tasks. For routine or moderately complex tasks, proceed without asking.
- Do not ask performative or obvious questions. If the information can be reasonably inferred, proceed.
- When you must ask, send a single brief message with only the essential questions before starting any tool runs, then continue once answered.

If you must ask clarifying questions for a very complex task, you may briefly restate the critical interpretation of the request. Otherwise, skip restatements.

Assumptions:
- Make reasonable assumptions in your internal reasoning; do not state assumptions in the response or interim messages.
- Exception: only within a necessary clarifying message for a very complex task, you may state key assumptions that require user confirmation.

For complex requests that require a lot of research, you should default to produce very comprehensive and thorough research reports.
</complex_request_guidelines>

<sub_agent_guidelines>
The sub-agents you spawn are each independent, they do not have any prior context on the request you are trying to solve and they do not have any memory of previous interactions you had with sub agents.
Queries that you provide to sub agents must be comprehensive, clear and fully self-contained. The sub agents you spawn have access to the web tools (search / browse), the company data file system and the data warehouses (if any).
It can also have access to any additional toolset that you may find useful for the task, using the toolsetsToAdd parameter. You can get the list of available toolsets using the toolsets tool prior to calling the sub agent.
Tasks that you give to sub-agents must be small and granular. Bias towards breaking down a large task into several smaller tasks.

Never delegate the whole request as a single sub-agent task.
Each sub-agent task must be atomic, outcome-scoped, and self-contained. Prefer parallel sub-agent calls for independent sub-tasks; run sequentially only when necessary.
If decomposition is not feasible and no exclusive sub-agent toolset is required, the primary agent should execute the task directly instead of delegating.

When using sub-agents for data analytics tasks or querying data warehouses, do not give the sub-agent an exact SQL query to run. Let the sub agent analyze the data warehouse itself, and let it craft the correct SQL queries.
</sub_agent_guidelines>
`;

const toolsPrompt = `<company_data_guidelines>
You can use the Company Data tools to explore and search through the user's internal, unstructured, textual Company Data.

This data can come from various sources, such as internal messaging systems, emails, knowledge bases code repositories, project management systems, support tickets etc...

The data sources are organized in a directed graph.
Each root node represents a data source. Each node in the data sources have exactly one parent and optionally some children (\`hasChildren\`).

You can use \`list\` to list the nodes that are direct children of a given node. This will return the nodeId and title for each node. Note that documents can also have children in some data sources.
You can use \`locate_in_tree\` to view the whole path leading to a given node (you will see the whole subtree that contains the node, from the root up to the node)
You can search for a node by title using the \`find\` tool on a given node (will explore all children of this node recursively)
You can search by running a semantic search (recursively) against the content of all children of a node
You can read the actual content in a document node using the \`cat\` tool
</company_data_guidelines>

<data_warehouses_guidelines>
You can use the Data Warehouses tools to:
- explore what tables are available in the user's data warehouses
- describe the tables structure
- execute a SQL query against a set of tables

In order to properly use the data warehouses, it is useful to also search through company data in case there is some documentation available about the tables, some additional semantic layer, or some code that may define how the tables are built in the first place.
</data_warehouses_guidelines>

<additional_tools>
If you need a capability that is not available in the tools you have access to, you can call the toolsets tool to get the list of all available tools of the platform, and then call a sub-agent with the tool you need.
</additional_tools>
`;

const offloadedBrowsingPrompt = `<web_browsing_guidelines>
You can use the web tools to search the web and browse web pages.

Default approach for most web tasks:
- First, use \`websearch\` to identify high-quality candidate sources (official docs, news, primary data, reputable analyses).
- Then, use \`webbrowser\` on the most relevant links to gather details. Do not rely solely on search snippets for substantive answers.
- For each key claim, policy detail, number, quote, code example, or step-by-step instruction, prefer reading the page content rather than inferring from summaries.

When to browse directly (skip or minimize search):
- You already have a URL, the request references a specific page/site, or the topic is niche and best answered from a known source.

Reading page contents (files created by browsing):
- The browsing tool returns a summary and creates a file (one per URL) with the full page content in markdown.
- Use the \`conversation_files__cat\` tool with \`offset\` and \`limit\` to read by chunks of at most 10,000 characters. Target the relevant sections you need to reason and answer accurately; avoid dumping entire files.
- If the fileId is visible in tool output, use \`conversation_files__cat\` directly with that id.

Balance and depth:
- If results conflict or lack detail, browse additional candidates.
- Avoid over-browsing when unnecessary; favor precision: read just enough to be confident and accurate.
</web_browsing_guidelines>
`;

const outputPrompt = `<output_guidelines>
NEVER address the user before you have run all necessary tools and are ready to provide your final answer. DO NOT open with phrases like "Here is..." or "Summary:" or "I'll conduct.." or "I'll start by...".
Only output internal reasoning and tool calls until you are ready to provide your answer.

Exception for clarifications (very complex tasks only):
- If critical information is missing and you cannot proceed without it, and the task is very complex/deep research, you may send one brief clarifying message before using tools.
- Keep that message to only essential questions. You may include key assumptions that require user confirmation; avoid any other commentary. Outside of this case, do not message the user until the final answer.

 Formatting rules (adapt to the task):
  - Match format and length to the task. Keep simple answers concise and natural; produce long-form structured documents only when warranted.
  - Short answers: write a naturally flowing paragraph with short sentences. Avoid headings. Use bullets only for actual lists, not to compose the whole answer.
  - Long-form/standalone docs: when appropriate, structure with clear sections and descriptive headings. For standalone documents (reports, memos, RFCs), you may use a single H1 as the document title; otherwise start at H2 ("##") and use H3 ("###") for subsections. Lead each major section with a brief narrative paragraph. Use richer Markdown for readability: bold for key takeaways, italics for nuance or caveats, blockquotes for short quotations, and inline code for identifiers or paths. Use bullets only for genuine, short enumerations; avoid list-only sections and avoid stacking multiple lists where paragraphs would read better.
  - Numbered lists only for true sequences or procedures.
  - Tables or code blocks only when they improve clarity; otherwise avoid.
  - NEVER use filler openers ("Here is...", "Summary:"). Write directly.

Do not use the content_creation tool for markdown documents. Only use it for truly interactive outputs that require React components.
Markdown documents can be written directly in the response, they will be properly rendered by the client.

Heavily bias against using the content_creation tool for what could be written directly as Markdown in the conversation (unless explicitly requested by the user).
Never use the slideshow tool unless explicitly requested by the user.
</output_guidelines>`;

const dustDeepInstructions = `${dustDeepPrimaryGoal}\n${requestComplexityPrompt}\n${toolsPrompt}\n${outputPrompt}`;
const subAgentInstructions = `${subAgentPrimaryGoal}\n${offloadedBrowsingPrompt}\n${toolsPrompt}`;
const browserSummaryAgentInstructions = `<primary_goal>
You are a web page summary agent. Your primary role is to summarize web page content.
You are provided with a web page content and you must produce a high quality comprehensive summary of the content.
Your goal is to remove the noise without altering meaning or removing important information. You may use a bullet-points-heavy format.
Provide URLs for sub-pages that that are relevant to the summary.
</primary_goal>`;
const planningAgentInstructions = `<primary_goal>
You are a research planning agent. Your primary role is to review and improve research plans provided to you by another agent.
The plans you propose must be short and straight to the point.
The plan must be composed by tasks that are as short and atomic as possible. The plan must be very clear about which tasks can be parallelized and which ones must be executed sequentially.
Ensure that each task cannot be further decomposed into smaller tasks. This is crucial. The plan can contain loops (for each X do Y).
The plan must not include any sections related to time estimates, real world validation benchmarks, setting up monitoring, gathering feedback or insights from real humans or any other speculative sections that the agent won't be able to execute by itself.
The plan should not be prescriptive and you should assume that your own knowledge on the researched topic is limited or outdated. Refrain from suggesting rigid data schemas.
Insist that the agent should discover knowledge via research without relying on its own internal knowledge.
Your role is NOT to execute the plan, but to review and improve it.
</primary_goal>`;

function getModelConfig(
  owner: WorkspaceType,
  prefer: "anthropic" | "openai",
  reasoning: boolean = true
): {
  modelConfiguration: ModelConfigurationType;
  reasoningEffort: AgentReasoningEffort;
} | null {
  const preferredModel: {
    model: ModelConfigurationType;
    reasoningEffort: AgentReasoningEffort;
  } =
    prefer === "anthropic"
      ? {
          model: CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG,
          reasoningEffort: reasoning
            ? "medium"
            : CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG.minimumReasoningEffort,
        }
      : prefer === "openai"
        ? {
            model: GPT_5_MODEL_CONFIG,
            reasoningEffort: reasoning
              ? "medium"
              : GPT_5_MODEL_CONFIG.minimumReasoningEffort,
          }
        : assertNever(prefer);

  const secondPreferredModel: {
    model: ModelConfigurationType;
    reasoningEffort: AgentReasoningEffort;
  } =
    prefer === "anthropic"
      ? {
          model: GPT_5_MODEL_CONFIG,
          reasoningEffort: reasoning
            ? "medium"
            : GPT_5_MODEL_CONFIG.minimumReasoningEffort,
        }
      : {
          model: CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG,
          reasoningEffort: reasoning
            ? "medium"
            : CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG.minimumReasoningEffort,
        };

  if (isProviderWhitelisted(owner, preferredModel.model.providerId)) {
    return {
      modelConfiguration: preferredModel.model,
      reasoningEffort: preferredModel.reasoningEffort,
    };
  }

  if (isProviderWhitelisted(owner, secondPreferredModel.model.providerId)) {
    return {
      modelConfiguration: secondPreferredModel.model,
      reasoningEffort: secondPreferredModel.reasoningEffort,
    };
  }

  // Otherwise we use whatever the default large model is, using the default reasoning effort.
  const modelConfiguration = getLargeWhitelistedModel(owner);
  if (!modelConfiguration) {
    return null;
  }
  return {
    modelConfiguration,
    reasoningEffort: modelConfiguration.defaultReasoningEffort,
  };
}

function getFastModelConfig(owner: WorkspaceType): {
  modelConfiguration: ModelConfigurationType;
  reasoningEffort: AgentReasoningEffort;
} | null {
  if (isProviderWhitelisted(owner, "google_ai_studio")) {
    return {
      modelConfiguration: GEMINI_2_5_FLASH_MODEL_CONFIG,
      reasoningEffort: "none",
    };
  }
  return getModelConfig(owner, "anthropic", false);
}

function getMaxReasoningModelConfig(owner: WorkspaceType): {
  modelConfiguration: ModelConfigurationType;
  reasoningEffort: AgentReasoningEffort;
} | null {
  if (isProviderWhitelisted(owner, "openai")) {
    return {
      modelConfiguration: GPT_5_MODEL_CONFIG,
      reasoningEffort: "high",
    };
  }
  if (isProviderWhitelisted(owner, "anthropic")) {
    return {
      modelConfiguration: CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG,
      reasoningEffort: "high",
    };
  }
  return getModelConfig(owner, "anthropic");
}

function getCompanyDataAction(
  preFetchedDataSources: PrefetchedDataSourcesType | null,
  dataSourcesFileSystemMCPServerView: MCPServerViewResource | null
): MCPServerConfigurationType | null {
  if (!preFetchedDataSources) {
    return null;
  }

  const dataSourceViews = preFetchedDataSources.dataSourceViews.filter(
    (dsView) =>
      dsView.isInGlobalSpace &&
      dsView.dataSource.connectorProvider !== "webcrawler"
  );
  if (dataSourceViews.length === 0 || !dataSourcesFileSystemMCPServerView) {
    return null;
  }

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.DUST_DEEP + "-company-data-action",
    type: "mcp_server_configuration",
    name: "company_data",
    description: "The user's internal company data.",
    mcpServerViewId: dataSourcesFileSystemMCPServerView.sId,
    internalMCPServerId: dataSourcesFileSystemMCPServerView.internalMCPServerId,
    dataSources: dataSourceViews.map((dsView) => ({
      dataSourceViewId: dsView.sId,
      workspaceId: preFetchedDataSources.workspaceId,
      filter: { parents: null, tags: null },
    })),
    tables: null,
    childAgentId: null,
    reasoningModel: null,
    additionalConfiguration: {},
    timeFrame: null,
    dustAppConfiguration: null,
    jsonSchema: null,
    secretName: null,
  };
}

function getCompanyDataWarehousesAction(
  preFetchedDataSources: PrefetchedDataSourcesType | null,
  dataWarehousesMCPServerView: MCPServerViewResource | null
): MCPServerConfigurationType | null {
  if (!preFetchedDataSources) {
    return null;
  }

  const globalWarehouses = preFetchedDataSources.dataSourceViews.filter(
    (dsView) => dsView.isInGlobalSpace && isRemoteDatabase(dsView.dataSource)
  );

  if (globalWarehouses.length === 0 || !dataWarehousesMCPServerView) {
    return null;
  }

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.DUST_DEEP + "-data-warehouses-action",
    type: "mcp_server_configuration",
    name: "data_warehouses",
    description: "The user's data warehouses.",
    mcpServerViewId: dataWarehousesMCPServerView.sId,
    internalMCPServerId: dataWarehousesMCPServerView.internalMCPServerId,
    dataSources: globalWarehouses.map((dsView) => ({
      dataSourceViewId: dsView.sId,
      workspaceId: preFetchedDataSources.workspaceId,
      filter: { parents: null, tags: null },
    })),
    tables: null,
    childAgentId: null,
    reasoningModel: null,
    additionalConfiguration: {},
    timeFrame: null,
    dustAppConfiguration: null,
    jsonSchema: null,
    secretName: null,
  };
}

export function _getDustDeepGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    webSearchBrowseMCPServerView,
    dataSourcesFileSystemMCPServerView,
    contentCreationMCPServerView,
    runAgentMCPServerView,
    dataWarehousesMCPServerView,
    toolsetsMCPServerView,
    slideshowMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    webSearchBrowseMCPServerView: MCPServerViewResource | null;
    dataSourcesFileSystemMCPServerView: MCPServerViewResource | null;
    contentCreationMCPServerView: MCPServerViewResource | null;
    runAgentMCPServerView: MCPServerViewResource | null;
    dataWarehousesMCPServerView: MCPServerViewResource | null;
    toolsetsMCPServerView: MCPServerViewResource | null;
    slideshowMCPServerView: MCPServerViewResource | null;
  }
): AgentConfigurationType | null {
  const owner = auth.getNonNullableWorkspace();
  const pictureUrl = "https://dust.tt/static/systemavatar/dust_avatar_full.png";
  const modelConfig = getModelConfig(owner, "anthropic");

  const deepAgent: Omit<
    AgentConfigurationType,
    "status" | "maxStepsPerRun" | "actions"
  > = {
    id: -1,
    sId: GLOBAL_AGENTS_SID.DUST_DEEP,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: DUST_DEEP_NAME,
    description: DUST_DEEP_DESCRIPTION,
    instructions: dustDeepInstructions,
    pictureUrl,
    scope: "global" as const,
    userFavorite: false,
    model: dummyModelConfiguration,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };

  if (settings?.status === "disabled_by_admin" || !modelConfig) {
    return {
      ...deepAgent,
      status: "disabled_by_admin",
      actions: [],
      maxStepsPerRun: 0,
    };
  }

  const model: AgentModelConfigurationType = {
    providerId: modelConfig.modelConfiguration.providerId,
    modelId: modelConfig.modelConfiguration.modelId,
    temperature: 1.0,
    reasoningEffort: modelConfig.reasoningEffort,
    promptCaching: true,
  };

  deepAgent.model = model;

  const actions: MCPServerConfigurationType[] = [];

  const companyDataAction = getCompanyDataAction(
    preFetchedDataSources,
    dataSourcesFileSystemMCPServerView
  );
  if (companyDataAction) {
    actions.push(companyDataAction);
  }

  actions.push(
    ..._getDefaultWebActionsForGlobalAgent({
      agentId: GLOBAL_AGENTS_SID.DUST_DEEP,
      webSearchBrowseMCPServerView,
    }),
    ..._getToolsetsToolsConfiguration({
      agentId: GLOBAL_AGENTS_SID.DUST_TASK,
      toolsetsMcpServerView: toolsetsMCPServerView,
    })
  );

  // Add data warehouses tool with all warehouses in global space (all remote DBs)
  const dataWarehousesAction = getCompanyDataWarehousesAction(
    preFetchedDataSources,
    dataWarehousesMCPServerView
  );
  if (dataWarehousesAction) {
    actions.push(dataWarehousesAction);
  }

  // Add Content Creation tool.
  if (contentCreationMCPServerView) {
    actions.push({
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST_DEEP + "-content-creation",
      type: "mcp_server_configuration",
      name: "content_creation" satisfies InternalMCPServerNameType,
      description: "Create & update Content Creation files.",
      mcpServerViewId: contentCreationMCPServerView.sId,
      internalMCPServerId: contentCreationMCPServerView.internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
    });
  }

  // Add run_agent to call dust-task
  if (runAgentMCPServerView) {
    actions.push({
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST_DEEP + "-run-agent-dust-task",
      type: "mcp_server_configuration",
      name: "sub_agent",
      description: "Run the dust-task sub-agent for focused tasks.",
      mcpServerViewId: runAgentMCPServerView.sId,
      internalMCPServerId: runAgentMCPServerView.internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: GLOBAL_AGENTS_SID.DUST_TASK,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
    });
    actions.push({
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST_DEEP + "-run-agent-dust-planning",
      type: "mcp_server_configuration",
      name: "planning_agent",
      description:
        "Run the dust-planning sub-agent for planning research tasks.",
      mcpServerViewId: runAgentMCPServerView.sId,
      internalMCPServerId: runAgentMCPServerView.internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: GLOBAL_AGENTS_SID.DUST_PLANNING,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
    });
  }

  // Add Slideshow tool.
  if (slideshowMCPServerView) {
    actions.push({
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST_DEEP + "-slideshow",
      type: "mcp_server_configuration",
      name: "slideshow" satisfies InternalMCPServerNameType,
      description: "Create & update interactive slideshow presentations.",
      mcpServerViewId: slideshowMCPServerView.sId,
      internalMCPServerId: slideshowMCPServerView.internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
    });
  }

  // Fix the action ids.
  actions.forEach((action, i) => {
    action.id = -i;
  });

  return {
    ...deepAgent,
    status: "active",
    actions,
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
  };
}

export function _getDustTaskGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    webSearchBrowseWithSummaryMCPServerView,
    dataSourcesFileSystemMCPServerView,
    dataWarehousesMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    webSearchBrowseWithSummaryMCPServerView: MCPServerViewResource | null;
    dataSourcesFileSystemMCPServerView: MCPServerViewResource | null;
    dataWarehousesMCPServerView: MCPServerViewResource | null;
  }
): AgentConfigurationType | null {
  const owner = auth.getNonNullableWorkspace();

  const name = "dust-task";
  const description =
    "Focused research sub-agent. Same data/web tools as dust-deep, without Content Creation or spawning sub-agents.";

  const pictureUrl =
    "https://dust.tt/static/systemavatar/dust-task_avatar_full.png";

  const dustTaskAgent: Omit<
    AgentConfigurationType,
    "status" | "maxStepsPerRun" | "actions"
  > = {
    id: -1,
    sId: GLOBAL_AGENTS_SID.DUST_TASK,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name,
    description,
    instructions: subAgentInstructions,
    pictureUrl,
    scope: "global" as const,
    userFavorite: false,
    model: dummyModelConfiguration,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };

  const modelConfig = getModelConfig(owner, "anthropic", false);

  if (!modelConfig || settings?.status === "disabled_by_admin") {
    return {
      ...dustTaskAgent,
      status: "disabled_by_admin",
      actions: [],
      maxStepsPerRun: 0,
    };
  }

  const model: AgentModelConfigurationType = {
    providerId: modelConfig.modelConfiguration.providerId,
    modelId: modelConfig.modelConfiguration.modelId,
    temperature: 1.0,
    reasoningEffort: modelConfig.reasoningEffort,
  };

  dustTaskAgent.model = model;

  const actions: MCPServerConfigurationType[] = [];

  const companyDataAction = getCompanyDataAction(
    preFetchedDataSources,
    dataSourcesFileSystemMCPServerView
  );
  if (companyDataAction) {
    actions.push(companyDataAction);
  }

  const summaryAgent = _getBrowserSummaryAgent(auth, { settings });

  if (webSearchBrowseWithSummaryMCPServerView && summaryAgent) {
    actions.push({
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST_TASK + "-websearch-browse-with-summaryaction",
      type: "mcp_server_configuration",
      name: "webtools",
      description: DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
      mcpServerViewId: webSearchBrowseWithSummaryMCPServerView.sId,
      internalMCPServerId:
        webSearchBrowseWithSummaryMCPServerView.internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: summaryAgent.sId,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
    });
  }

  const dataWarehousesAction = getCompanyDataWarehousesAction(
    preFetchedDataSources,
    dataWarehousesMCPServerView
  );
  if (dataWarehousesAction) {
    actions.push(dataWarehousesAction);
  }

  actions.forEach((action, i) => (action.id = -i));

  return {
    ...dustTaskAgent,
    status: "active",
    actions,
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
  };
}

export function _getPlanningAgent(
  auth: Authenticator,
  { settings }: { settings: GlobalAgentSettings | null }
): AgentConfigurationType | null {
  const owner = auth.getNonNullableWorkspace();

  const name = "dust-planning";
  const description = "A agent that plans research tasks.";

  const pictureUrl =
    "https://dust.tt/static/systemavatar/dust-task_avatar_full.png";

  const planningAgent: Omit<
    AgentConfigurationType,
    "status" | "maxStepsPerRun" | "actions"
  > = {
    id: -1,
    sId: GLOBAL_AGENTS_SID.DUST_PLANNING,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name,
    description,
    instructions: planningAgentInstructions,
    pictureUrl,
    scope: "global" as const,
    userFavorite: false,
    model: dummyModelConfiguration,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };

  const modelConfig = getMaxReasoningModelConfig(owner);
  if (!modelConfig || settings?.status === "disabled_by_admin") {
    return {
      ...planningAgent,
      status: "disabled_by_admin",
      actions: [],
      maxStepsPerRun: 0,
    };
  }

  const model: AgentModelConfigurationType = {
    providerId: modelConfig.modelConfiguration.providerId,
    modelId: modelConfig.modelConfiguration.modelId,
    temperature: 1.0,
    reasoningEffort: modelConfig.reasoningEffort,
  };
  planningAgent.model = model;

  return {
    ...planningAgent,
    status: "active",
    actions: [],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
  };
}

export function _getBrowserSummaryAgent(
  auth: Authenticator,
  { settings }: { settings: GlobalAgentSettings | null }
): AgentConfigurationType | null {
  const owner = auth.getNonNullableWorkspace();

  const name = "dust-browser-summary";
  const description = "A agent that summarizes web page content.";

  const pictureUrl =
    "https://dust.tt/static/systemavatar/dust-task_avatar_full.png";

  const browserSummaryAgent: Omit<
    AgentConfigurationType,
    "status" | "maxStepsPerRun" | "actions"
  > = {
    id: -1,
    sId: GLOBAL_AGENTS_SID.DUST_BROWSER_SUMMARY,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name,
    description,
    instructions: browserSummaryAgentInstructions,
    pictureUrl,
    scope: "global" as const,
    userFavorite: false,
    model: dummyModelConfiguration,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };

  const modelConfig = getFastModelConfig(owner);

  if (!modelConfig || settings?.status === "disabled_by_admin") {
    return {
      ...browserSummaryAgent,
      status: "disabled_by_admin",
      actions: [],
      maxStepsPerRun: 0,
    };
  }

  const model: AgentModelConfigurationType = {
    providerId: modelConfig.modelConfiguration.providerId,
    modelId: modelConfig.modelConfiguration.modelId,
    temperature: 1.0,
    reasoningEffort: modelConfig.reasoningEffort,
  };

  browserSummaryAgent.model = model;

  return {
    ...browserSummaryAgent,
    status: "active",
    actions: [],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
  };
}
