import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { ADVANCED_SEARCH_SWITCH } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolContext } from "@app/lib/actions/types";
import {
  isLightServerSideMCPToolConfiguration,
  isServerSideMCPServerConfiguration,
} from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Check if we are in advanced search mode,
 * relying on a magic value stored in the additionalConfiguration.
 */
function isAdvancedSearchMode(toolContext?: ToolContext) {
  return (
    (toolContext?.runContext &&
      isLightServerSideMCPToolConfiguration(
        toolContext.runContext.toolConfiguration
      ) &&
      toolContext.runContext.toolConfiguration.additionalConfiguration[
        ADVANCED_SEARCH_SWITCH
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      ] === true) ||
    (toolContext?.listToolsContext &&
      isServerSideMCPServerConfiguration(
        toolContext.listToolsContext.agentActionConfiguration
      ) &&
      toolContext.listToolsContext.agentActionConfiguration
        .additionalConfiguration[ADVANCED_SEARCH_SWITCH] === true)
  );
}

/**
 * Each server is imported on demand: a static import here loads all 86 of them,
 * and their vendor SDKs, into every front-api boot. `googleapis`, `mathjs` and
 * the ElevenLabs SDK alone accounted for ~6,000 modules of startup work for
 * tools that most requests never touch.
 */
export async function getInternalMCPServer(
  auth: Authenticator,
  {
    internalMCPServerName,
    mcpServerId,
  }: {
    internalMCPServerName: InternalMCPServerNameType;
    mcpServerId: string;
  },
  toolContext?: ToolContext
): Promise<McpServer> {
  switch (internalMCPServerName) {
    case "github":
      return (await import("@app/lib/api/actions/servers/github")).default(
        auth,
        toolContext
      );
    case "ashby":
      return (await import("@app/lib/api/actions/servers/ashby")).default(
        auth,
        toolContext
      );
    case "clari_copilot":
      return (
        await import("@app/lib/api/actions/servers/clari_copilot")
      ).default(auth, toolContext);
    case "hubspot":
      return (await import("@app/lib/api/actions/servers/hubspot")).default(
        auth,
        toolContext
      );
    case "image_generation":
      return (
        await import("@app/lib/api/actions/servers/image_generation")
      ).default(auth, toolContext);
    case "speech_generator":
      return (
        await import("@app/lib/api/actions/servers/speech_generator")
      ).default(auth, toolContext);
    case "sound_studio":
      return (
        await import("@app/lib/api/actions/servers/sound_studio")
      ).default(auth, toolContext);
    case "file_generation":
      return (
        await import("@app/lib/api/actions/servers/file_generation")
      ).default(auth, toolContext);
    case "interactive_content":
      return (
        await import("@app/lib/api/actions/servers/interactive_content")
      ).default(auth, toolContext);
    case "query_tables_v2":
      return (
        await import("@app/lib/api/actions/servers/query_tables_v2")
      ).default(auth, toolContext);
    case "primitive_types_debugger":
      return (
        await import("@app/lib/api/actions/servers/primitive_types_debugger")
      ).default(auth, toolContext);
    case "jit_testing":
      return (await import("@app/lib/api/actions/servers/jit_testing")).default(
        auth,
        toolContext
      );
    case "common_utilities":
      return (
        await import("@app/lib/api/actions/servers/common_utilities")
      ).default(auth, toolContext);
    case "web_search_&_browse":
      return (
        await import("@app/lib/api/actions/servers/web_search_browse")
      ).default(auth, toolContext);
    case "search":
      // If we are in advanced search mode, we use the data_sources_file_system server instead.
      if (isAdvancedSearchMode(toolContext)) {
        return (
          await import("@app/lib/api/actions/servers/data_sources_file_system")
        ).default(auth, toolContext);
      }
      return (await import("@app/lib/api/actions/servers/search")).default(
        auth,
        toolContext
      );
    case "missing_action_catcher":
      return (
        await import("@app/lib/api/actions/servers/missing_action_catcher")
      ).default(auth, toolContext);
    case "notion":
      return (await import("@app/lib/api/actions/servers/notion")).default(
        auth,
        toolContext
      );
    case "openai_usage":
      return (
        await import("@app/lib/api/actions/servers/openai_usage")
      ).default(auth, toolContext);
    case "include_data":
      return (
        await import("@app/lib/api/actions/servers/include_data")
      ).default(auth, toolContext);
    case "run_agent":
      return (await import("@app/lib/api/actions/servers/run_agent")).default(
        auth,
        toolContext
      );
    case "agent_delegation":
      return (
        await import("@app/lib/api/actions/servers/agent_delegation")
      ).default(auth, toolContext);
    case "run_dust_app":
      return (
        await import("@app/lib/api/actions/servers/run_dust_app")
      ).default(auth, toolContext);
    case "agent_router":
      return (
        await import("@app/lib/api/actions/servers/agent_router")
      ).default(auth, toolContext);
    case "extract_data":
      return (
        await import("@app/lib/api/actions/servers/extract_data")
      ).default(auth, toolContext);
    case "salesforce":
      return (await import("@app/lib/api/actions/servers/salesforce")).default(
        auth,
        toolContext
      );
    case "salesloft":
      return (await import("@app/lib/api/actions/servers/salesloft")).default(
        auth,
        toolContext
      );
    case "slab":
      return (await import("@app/lib/api/actions/servers/slab")).default(
        auth,
        toolContext
      );
    case "snowflake":
      return (await import("@app/lib/api/actions/servers/snowflake")).default(
        auth,
        toolContext
      );
    case "gmail":
      return (await import("@app/lib/api/actions/servers/gmail")).default(
        auth,
        toolContext
      );
    case "gong":
      return (await import("@app/lib/api/actions/servers/gong")).default(
        auth,
        toolContext
      );
    case "google_calendar":
      return (
        await import("@app/lib/api/actions/servers/google_calendar")
      ).default(auth, toolContext);
    case "google_drive":
      return (
        await import("@app/lib/api/actions/servers/google_drive")
      ).default(auth, toolContext);
    case "google_sheets":
      return (
        await import("@app/lib/api/actions/servers/google_sheets")
      ).default(auth, toolContext);
    case "data_sources_file_system":
      return (
        await import("@app/lib/api/actions/servers/data_sources_file_system")
      ).default(auth, toolContext);
    case "conversation_files":
      return (
        await import("@app/lib/api/actions/servers/conversation_files")
      ).default(auth, toolContext);
    case "conversation_side_panel":
      return (
        await import("@app/lib/api/actions/servers/conversation_side_panel")
      ).default(auth, toolContext);
    case "files":
      return (await import("@app/lib/api/actions/servers/files")).default(
        auth,
        toolContext
      );
    case "databricks":
      return (await import("@app/lib/api/actions/servers/databricks")).default(
        auth,
        toolContext
      );
    case "servicenow":
      return (await import("@app/lib/api/actions/servers/servicenow")).default(
        auth,
        toolContext
      );
    case "shopify":
      return (await import("@app/lib/api/actions/servers/shopify")).default(
        auth,
        toolContext
      );
    case "jira":
      return (await import("@app/lib/api/actions/servers/jira")).default(
        auth,
        toolContext
      );
    case "luma":
      return (await import("@app/lib/api/actions/servers/luma")).default(
        auth,
        toolContext
      );
    case "microsoft_drive":
      return (
        await import("@app/lib/api/actions/servers/microsoft_drive")
      ).default(auth, toolContext);
    case "microsoft_excel":
      return (
        await import("@app/lib/api/actions/servers/microsoft_excel")
      ).default(auth, toolContext);
    case "microsoft_teams":
      return (
        await import("@app/lib/api/actions/servers/microsoft_teams")
      ).default(auth, toolContext);
    case "monday":
      return (await import("@app/lib/api/actions/servers/monday")).default(
        auth,
        toolContext
      );
    case "slack":
      return (
        await import("@app/lib/api/actions/servers/slack_personal")
      ).default(auth, mcpServerId, toolContext);
    case "slack_bot":
      return (await import("@app/lib/api/actions/servers/slack_bot")).default(
        auth,
        mcpServerId,
        toolContext
      );
    case "agent_memory":
      return (
        await import("@app/lib/api/actions/servers/agent_memory")
      ).default(auth, toolContext);
    case "confluence":
      return (await import("@app/lib/api/actions/servers/confluence")).default(
        auth,
        toolContext
      );
    case "outlook":
      return (
        await import("@app/lib/api/actions/servers/outlook/mail_server")
      ).default(auth, toolContext);
    case "outlook_calendar":
      return (
        await import("@app/lib/api/actions/servers/outlook/calendar_server")
      ).default(auth, toolContext);
    case "agent_sidekick_agent_state":
      return (
        await import("@app/lib/api/actions/servers/agent_sidekick_agent_state")
      ).default(auth, toolContext);
    case "agent_sidekick_context":
      return (
        await import("@app/lib/api/actions/servers/agent_sidekick_context")
      ).default(auth, toolContext);
    case "agent_templates":
      return (
        await import("@app/lib/api/actions/servers/agent_templates")
      ).default(auth, toolContext);
    case "exa_people_and_company":
      return (await import("@app/lib/api/actions/servers/exa")).default(
        auth,
        toolContext
      );
    case "fathom":
      return (await import("@app/lib/api/actions/servers/fathom")).default(
        auth,
        toolContext
      );
    case "freshservice":
      return (
        await import("@app/lib/api/actions/servers/freshservice")
      ).default(auth, toolContext);
    case "data_warehouses":
      return (
        await import("@app/lib/api/actions/servers/data_warehouses")
      ).default(auth, toolContext);
    case "toolsets":
      return (await import("@app/lib/api/actions/servers/toolsets")).default(
        auth,
        toolContext
      );
    case "val_town":
      return (await import("@app/lib/api/actions/servers/val_town")).default(
        auth,
        toolContext
      );
    case "vanta":
      return (await import("@app/lib/api/actions/servers/vanta")).default(
        auth,
        toolContext
      );
    case "http_client":
      return (await import("@app/lib/api/actions/servers/http_client")).default(
        auth,
        toolContext
      );
    case "front":
      return (await import("@app/lib/api/actions/servers/front")).default(
        auth,
        toolContext
      );
    case "zendesk":
      return (await import("@app/lib/api/actions/servers/zendesk")).default(
        auth,
        toolContext
      );
    case "workspace_analytics":
      return (
        await import("@app/lib/api/actions/servers/workspace_analytics")
      ).default(auth, toolContext);
    case "skill_management":
      return (
        await import("@app/lib/api/actions/servers/skill_management")
      ).default(auth, toolContext);
    case "skill_authoring":
      return (
        await import("@app/lib/api/actions/servers/skill_authoring")
      ).default(auth, toolContext);
    case "triggers_management":
      return (
        await import("@app/lib/api/actions/servers/triggers_management")
      ).default(auth, toolContext);
    case "productboard":
      return (
        await import("@app/lib/api/actions/servers/productboard")
      ).default(auth, toolContext);
    case "pod_manager":
      return (await import("@app/lib/api/actions/servers/pod_manager")).default(
        auth,
        toolContext
      );
    case "pod_tasks":
      return (await import("@app/lib/api/actions/servers/pod_tasks")).default(
        auth,
        toolContext
      );
    case "poke":
      return (await import("@app/lib/api/actions/servers/poke")).default(
        auth,
        toolContext
      );
    case "ask_user_question":
      return (
        await import("@app/lib/api/actions/servers/ask_user_question")
      ).default(auth, toolContext);
    case "ukg_ready":
      return (await import("@app/lib/api/actions/servers/ukg_ready")).default(
        auth,
        toolContext
      );
    case "user_mentions":
      return (
        await import("@app/lib/api/actions/servers/user_mentions")
      ).default(auth, toolContext);
    case "statuspage":
      return (await import("@app/lib/api/actions/servers/statuspage")).default(
        auth,
        toolContext
      );
    case "sandbox":
      return (await import("@app/lib/api/actions/servers/sandbox")).default(
        auth,
        toolContext
      );
    case "sandbox_functions":
      return (
        await import("@app/lib/api/actions/servers/sandbox_functions")
      ).default(auth, toolContext);
    case "wakeups":
      return (await import("@app/lib/api/actions/servers/wakeups")).default(
        auth,
        toolContext
      );
    case "plan_mode":
      return (await import("@app/lib/api/actions/servers/plan_mode")).default(
        auth,
        toolContext
      );
    case "workday":
      return (await import("@app/lib/api/actions/servers/workday")).default(
        auth,
        toolContext
      );
    case "user_analytics":
      return (
        await import("@app/lib/api/actions/servers/user_analytics")
      ).default(auth, toolContext);
    case "workspace_people":
      return (
        await import("@app/lib/api/actions/servers/workspace_people")
      ).default(auth, toolContext);
    case "user_memory":
      return (await import("@app/lib/api/actions/servers/user_memory")).default(
        auth,
        toolContext
      );
    case "activation_recommendations":
      return (
        await import("@app/lib/api/actions/servers/activation_recommendations")
      ).default(auth, toolContext);
    default:
      assertNever(internalMCPServerName);
  }
}
