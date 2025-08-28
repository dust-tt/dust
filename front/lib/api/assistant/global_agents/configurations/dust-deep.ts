import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
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
  CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
  getLargeWhitelistedModel,
  GLOBAL_AGENTS_SID,
  GPT_5_MODEL_CONFIG,
  isProviderWhitelisted,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types";

const dustDeepPrimaryGoal = `<primary_goal>
You are an agent. Your primarily role is to conduct research tasks on behalf of company employees.
As an AI agent, your own context window is limited so you spawn sub-agents to do some of the work for you when tasks require more than 3 steps of research.
You are then responsible to produce a final comprehensive answer based on the output of your research steps.
</primary_goal>`;

const subAgentPrimaryGoal = `<primary_goal>
You are an agent. Your primarily role is to conduct research tasks.
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
- it requires doing several web searches, browsing several web pages
- it requires running SQL queries
- it requires 3+ steps of tool uses

A request may seem simple at first, but turn out to be complex. If while executing the task you realize that a request is actually complex, you can re-classify the request as complex.

Do not mention request complexity to the user, this should only be used in your reasoning process.
</request_complexity>

<simple_request_guidelines>
Follow these guidelines if the user's request is simple.

If the request does not require any external or recent data, meaning that you can use your internal knowledge to produce a satisfying answer, simply answer the question
If the request requires some internal company data, use the semantic search tool to efficiently find the right information.

If the request requires general information that is likely more recent than your knowledge cutoff, use the web tools (search and browse) to answer the request.

Do not use sub-agents for simple requests, unless you need to use a tool that is only available for sub agents.
</simple_request_guidelines>

<complex_request_guidelines>
For complex requests, you must must act as a "research coordinator", focusing on planning. Heavily bias towards delegating sub tasks to the sub-agent. Ask the sub-agent to find specific documents node IDs on your behalf.
You can also use parallel tool calls to spawn several sub tasks concurrently in order to speed-up the overall process.
Before conducting any complex research, you critically reflects on the user's request, pinpoints ambiguities, asks up to four concise clarifying questions, and waits for the user's reply before proceeding.
Always begin by telling the user that you will first clarify your request before conducting a deep search, and that the search can take several minutes to proceed, depending on the complexity of the request.
Briefly restate the user's request (1–2 sentences) to confirm understanding.
List any assumptions you plan to make.
Ask no more than four precise questions that will help define scope, depth, or output expectations, and confirm that your assumptions match the user's expectations.
</complex_request_guidelines>

<sub_agent_guidelines>
The sub-agents you spawn are each independent, they do not have any prior context on the request your are trying to solve and they do not have any memory of previous interactions you had with sub agents.
Queries that you provide to sub agents must be comprehensive, clear and fully self-contained. The sub agents you spawn have access to the web tools (search / browse), the company data file system and the data warehouses (if any).
It can also have access to any tool that you may find useful for the task, using the toolsetsToAdd parameter. You can get the list of available tools using the toolsets tool priori to call the sub agent.
Tasks that you give to sub-agents must be small and granular. Bias towards breaking down a large task into several smaller tasks.

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

const outputPrompt = `<output_guidelines>
Do not address the user before you have ran all necessary tools and are ready to provide your final answer.
Only output internal reasoning and tool calls until you are ready to provide your answer.

Output length should not be artificially long.
</output_guidelines>`;

const dustDeepInstructions = `${dustDeepPrimaryGoal}\n${requestComplexityPrompt}\n${toolsPrompt}\n${outputPrompt}`;
const subAgentInstructions = `${subAgentPrimaryGoal}\n${toolsPrompt}`;

function getModelConfig(
  owner: WorkspaceType,
  prefer: "anthropic" | "openai"
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
          model: CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
          reasoningEffort: "medium",
        }
      : prefer === "openai"
        ? {
            model: GPT_5_MODEL_CONFIG,
            reasoningEffort: "medium",
          }
        : assertNever(prefer);

  const secondPreferredModel: {
    model: ModelConfigurationType;
    reasoningEffort: AgentReasoningEffort;
  } =
    prefer === "anthropic"
      ? {
          model: GPT_5_MODEL_CONFIG,
          reasoningEffort: "medium",
        }
      : {
          model: CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
          reasoningEffort: "medium",
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
  };
}

export function _getDustDeepGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    webSearchBrowseMCPServerView,
    dataSourcesFileSystemMCPServerView,
    canvasMCPServerView,
    runAgentMCPServerView,
    dataWarehousesMCPServerView,
    toolsetsMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    webSearchBrowseMCPServerView: MCPServerViewResource | null;
    dataSourcesFileSystemMCPServerView: MCPServerViewResource | null;
    canvasMCPServerView: MCPServerViewResource | null;
    runAgentMCPServerView: MCPServerViewResource | null;
    dataWarehousesMCPServerView: MCPServerViewResource | null;
    toolsetsMCPServerView: MCPServerViewResource | null;
  }
): AgentConfigurationType | null {
  const owner = auth.getNonNullableWorkspace();

  const name = "dust-deep";
  const description =
    "Deep research with company data, web search/browse, canvas, and data warehouses.";

  const pictureUrl =
    "https://dust.tt/static/systemavatar/dust-deep_avatar_full.png";

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
    name,
    description,
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

  // Add canvas tool
  if (canvasMCPServerView) {
    actions.push({
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST_DEEP + "-canvas",
      type: "mcp_server_configuration",
      name: "canvas" satisfies InternalMCPServerNameType,
      description: "Create & update canvas files.",
      mcpServerViewId: canvasMCPServerView.sId,
      internalMCPServerId: canvasMCPServerView.internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
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
    webSearchBrowseMCPServerView,
    dataSourcesFileSystemMCPServerView,
    dataWarehousesMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    webSearchBrowseMCPServerView: MCPServerViewResource | null;
    dataSourcesFileSystemMCPServerView: MCPServerViewResource | null;
    dataWarehousesMCPServerView: MCPServerViewResource | null;
  }
): AgentConfigurationType | null {
  const owner = auth.getNonNullableWorkspace();

  const name = "dust-task";
  const description =
    "Focused research sub-agent. Same data/web tools as dust-deep, without canvas or spawning sub-agents.";

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
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };

  const modelConfig = getModelConfig(owner, "openai");

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

  actions.push(
    ..._getDefaultWebActionsForGlobalAgent({
      agentId: GLOBAL_AGENTS_SID.DUST_TASK,
      webSearchBrowseMCPServerView,
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

  actions.forEach((action, i) => (action.id = -i));

  return {
    ...dustTaskAgent,
    status: "active",
    actions,
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
  };
}
