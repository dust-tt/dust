import type { InternalAllowedIconType } from "@app/components/resources/resources_icons";
import type { ToolDisplayLabels } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";

export type DefaultRemoteMCPServerConfig = {
  id: number;
  name: string;
  description: string;
  url: string;
  icon: InternalAllowedIconType;
  documentationUrl?: string;
  connectionInstructions?: string;
  authMethod: "bearer" | "oauth-dynamic" | null;
  supportedOAuthUseCases?: MCPOAuthUseCase[];
  scope?: string;
  toolStakes?: Record<string, "high" | "low" | "never_ask">;
  toolDisplayLabels?: Record<string, ToolDisplayLabels>;
};

export const DEFAULT_REMOTE_MCP_SERVERS: DefaultRemoteMCPServerConfig[] = [
  {
    id: 10000,
    name: "Stripe",
    description: "Stripe tools for secure payment and billing operations.",
    url: "https://mcp.stripe.com",
    icon: "StripeLogo",
    documentationUrl: "https://docs.stripe.com/building-with-llms",
    connectionInstructions:
      "You will need to provide your Stripe API key as a bearer token. We recommend using restricted API keys to limit access to the functionality your agents require.",
    authMethod: "bearer",
    toolStakes: {
      search_documentation: "never_ask",
      list_customers: "low",
      list_products: "low",
      list_prices: "low",
      list_invoices: "low",
      list_payment_intents: "low",
      list_subscriptions: "low",
      list_coupons: "low",
      list_disputes: "low",
      get_stripe_account_info: "low",

      create_customer: "high",
      create_product: "high",
      create_price: "high",
      create_payment_link: "high",
      create_invoice: "high",
      create_invoice_item: "high",
      finalize_invoice: "high",
      retrieve_balance: "high",
      create_refund: "high",
      cancel_subscription: "high",
      update_subscription: "high",
      create_coupon: "high",
      update_dispute: "high",
    },
    toolDisplayLabels: {
      search_documentation: {
        running: "Searching Stripe docs",
        done: "Search Stripe docs",
      },
      list_customers: {
        running: "Listing Stripe customers",
        done: "List Stripe customers",
      },
      list_products: {
        running: "Listing Stripe products",
        done: "List Stripe products",
      },
      list_prices: {
        running: "Listing Stripe prices",
        done: "List Stripe prices",
      },
      list_invoices: {
        running: "Listing Stripe invoices",
        done: "List Stripe invoices",
      },
      list_payment_intents: {
        running: "Listing Stripe payments",
        done: "List Stripe payments",
      },
      list_subscriptions: {
        running: "Listing Stripe subscriptions",
        done: "List Stripe subscriptions",
      },
      list_coupons: {
        running: "Listing Stripe coupons",
        done: "List Stripe coupons",
      },
      list_disputes: {
        running: "Listing Stripe disputes",
        done: "List Stripe disputes",
      },
      get_stripe_account_info: {
        running: "Getting Stripe account info",
        done: "Get Stripe account info",
      },
      create_customer: {
        running: "Creating Stripe customer",
        done: "Create Stripe customer",
      },
      create_product: {
        running: "Creating Stripe product",
        done: "Create Stripe product",
      },
      create_price: {
        running: "Creating Stripe price",
        done: "Create Stripe price",
      },
      create_payment_link: {
        running: "Creating Stripe payment link",
        done: "Create Stripe payment link",
      },
      create_invoice: {
        running: "Creating Stripe invoice",
        done: "Create Stripe invoice",
      },
      create_invoice_item: {
        running: "Creating Stripe invoice item",
        done: "Create Stripe invoice item",
      },
      finalize_invoice: {
        running: "Finalizing Stripe invoice",
        done: "Finalize Stripe invoice",
      },
      retrieve_balance: {
        running: "Retrieving Stripe balance",
        done: "Retrieve Stripe balance",
      },
      create_refund: {
        running: "Creating Stripe refund",
        done: "Create Stripe refund",
      },
      cancel_subscription: {
        running: "Canceling Stripe subscription",
        done: "Cancel Stripe subscription",
      },
      update_subscription: {
        running: "Updating Stripe subscription",
        done: "Update Stripe subscription",
      },
      create_coupon: {
        running: "Creating Stripe coupon",
        done: "Create Stripe coupon",
      },
      update_dispute: {
        running: "Updating Stripe dispute",
        done: "Update Stripe dispute",
      },
    },
  },
  {
    id: 10001,
    name: "Linear",
    description: "Linear tools for project management and issue tracking.",
    url: "https://mcp.linear.app/mcp",
    icon: "LinearLogo",
    documentationUrl: "https://linear.app/docs",
    authMethod: "oauth-dynamic",
    toolStakes: {
      search_documentation: "never_ask",
      list_comments: "never_ask",
      get_issue: "never_ask",
      get_issue_git_branch_name: "never_ask",
      list_issues: "never_ask",
      list_issue_statuses: "never_ask",
      get_issue_status: "never_ask",
      list_my_issues: "never_ask",
      list_issue_labels: "never_ask",
      list_projects: "never_ask",
      get_project: "never_ask",
      get_team: "never_ask",
      list_users: "never_ask",
      get_user: "never_ask",

      create_comment: "high",
      get_document: "high",
      list_documents: "high",
      create_issue: "high",
      update_issue: "high",
      create_project: "high",
      update_project: "high",
    },
    toolDisplayLabels: {
      search_documentation: {
        running: "Searching Linear docs",
        done: "Search Linear docs",
      },
      list_comments: {
        running: "Listing Linear comments",
        done: "List Linear comments",
      },
      get_issue: { running: "Getting Linear issue", done: "Get Linear issue" },
      get_issue_git_branch_name: {
        running: "Getting Linear branch name",
        done: "Get Linear branch name",
      },
      list_issues: {
        running: "Listing Linear issues",
        done: "List Linear issues",
      },
      list_issue_statuses: {
        running: "Listing Linear statuses",
        done: "List Linear statuses",
      },
      get_issue_status: {
        running: "Getting Linear issue status",
        done: "Get Linear issue status",
      },
      list_my_issues: {
        running: "Listing my Linear issues",
        done: "List my Linear issues",
      },
      list_issue_labels: {
        running: "Listing Linear labels",
        done: "List Linear labels",
      },
      list_projects: {
        running: "Listing Linear projects",
        done: "List Linear projects",
      },
      get_project: {
        running: "Getting Linear project",
        done: "Get Linear project",
      },
      get_team: { running: "Getting Linear team", done: "Get Linear team" },
      list_users: {
        running: "Listing Linear users",
        done: "List Linear users",
      },
      get_user: { running: "Getting Linear user", done: "Get Linear user" },
      create_comment: {
        running: "Creating Linear comment",
        done: "Create Linear comment",
      },
      get_document: {
        running: "Getting Linear document",
        done: "Get Linear document",
      },
      list_documents: {
        running: "Listing Linear documents",
        done: "List Linear documents",
      },
      create_issue: {
        running: "Creating Linear issue",
        done: "Create Linear issue",
      },
      update_issue: {
        running: "Updating Linear issue",
        done: "Update Linear issue",
      },
      create_project: {
        running: "Creating Linear project",
        done: "Create Linear project",
      },
      update_project: {
        running: "Updating Linear project",
        done: "Update Linear project",
      },
    },
  },
  {
    id: 10002,
    name: "Asana",
    description: "Asana tools for project management and issue tracking.",
    url: "https://mcp.asana.com/sse",
    icon: "AsanaLogo",
    documentationUrl:
      "https://developers.asana.com/docs/using-asanas-mcp-server",
    authMethod: "oauth-dynamic",
    toolStakes: {
      asana_get_attachment: "never_ask",
      asana_get_attachments_for_object: "never_ask",
      asana_get_goals: "never_ask",
      asana_get_goal: "never_ask",
      asana_create_goal: "low",
      asana_get_parent_goals_for_goal: "never_ask",
      asana_update_goal: "low",
      asana_get_portfolio: "never_ask",
      asana_get_portfolios: "never_ask",
      asana_get_items_for_portfolio: "never_ask",
      asana_get_project: "never_ask",
      asana_get_project_sections: "never_ask",
      asana_get_projects: "never_ask",
      asana_get_project_status: "never_ask",
      asana_get_project_statuses: "never_ask",
      asana_create_project_status: "low",
      asana_get_project_task_counts: "never_ask",
      asana_get_projects_for_team: "never_ask",
      asana_get_projects_for_workspace: "never_ask",
      asana_create_project: "low",
      asana_search_tasks: "never_ask",
      asana_get_task: "never_ask",
      asana_create_task: "low",
      asana_update_task: "low",
      asana_get_stories_for_task: "never_ask",
      asana_create_task_story: "low",
      asana_set_task_dependencies: "low",
      asana_set_task_dependents: "low",
      asana_set_parent_for_task: "low",
      asana_get_tasks: "never_ask",
      asana_delete_task: "low",
      asana_add_task_followers: "low",
      asana_remove_task_followers: "low",
      asana_get_teams_for_workspace: "never_ask",
      asana_get_teams_for_user: "never_ask",
      asana_get_time_period: "never_ask",
      asana_get_time_periods: "never_ask",
      asana_typeahead_search: "never_ask",
      asana_get_user: "never_ask",
      asana_get_team_users: "never_ask",
      asana_get_workspace_users: "never_ask",
      asana_list_workspaces: "never_ask",
    },
    toolDisplayLabels: {
      asana_search_tasks: {
        running: "Searching Asana tasks",
        done: "Search Asana tasks",
      },
      asana_get_task: { running: "Getting Asana task", done: "Get Asana task" },
      asana_create_task: {
        running: "Creating Asana task",
        done: "Create Asana task",
      },
      asana_update_task: {
        running: "Updating Asana task",
        done: "Update Asana task",
      },
      asana_delete_task: {
        running: "Deleting Asana task",
        done: "Delete Asana task",
      },
      asana_get_project: {
        running: "Getting Asana project",
        done: "Get Asana project",
      },
      asana_get_projects: {
        running: "Listing Asana projects",
        done: "List Asana projects",
      },
      asana_create_project: {
        running: "Creating Asana project",
        done: "Create Asana project",
      },
      asana_get_goals: {
        running: "Listing Asana goals",
        done: "List Asana goals",
      },
      asana_get_goal: { running: "Getting Asana goal", done: "Get Asana goal" },
      asana_create_goal: {
        running: "Creating Asana goal",
        done: "Create Asana goal",
      },
      asana_update_goal: {
        running: "Updating Asana goal",
        done: "Update Asana goal",
      },
      asana_get_stories_for_task: {
        running: "Getting Asana task stories",
        done: "Get Asana task stories",
      },
      asana_create_task_story: {
        running: "Creating Asana task story",
        done: "Create Asana task story",
      },
      asana_get_attachment: {
        running: "Getting Asana attachment",
        done: "Get Asana attachment",
      },
      asana_get_attachments_for_object: {
        running: "Getting Asana attachments",
        done: "Get Asana attachments",
      },
      asana_get_parent_goals_for_goal: {
        running: "Getting Asana parent goals",
        done: "Get Asana parent goals",
      },
      asana_get_portfolio: {
        running: "Getting Asana portfolio",
        done: "Get Asana portfolio",
      },
      asana_get_portfolios: {
        running: "Listing Asana portfolios",
        done: "List Asana portfolios",
      },
      asana_get_items_for_portfolio: {
        running: "Getting Asana portfolio items",
        done: "Get Asana portfolio items",
      },
      asana_get_project_sections: {
        running: "Getting Asana project sections",
        done: "Get Asana project sections",
      },
      asana_get_project_status: {
        running: "Getting Asana project status",
        done: "Get Asana project status",
      },
      asana_get_project_statuses: {
        running: "Listing Asana project statuses",
        done: "List Asana project statuses",
      },
      asana_create_project_status: {
        running: "Creating Asana project status",
        done: "Create Asana project status",
      },
      asana_get_project_task_counts: {
        running: "Getting Asana task counts",
        done: "Get Asana task counts",
      },
      asana_get_projects_for_team: {
        running: "Listing Asana team projects",
        done: "List Asana team projects",
      },
      asana_get_projects_for_workspace: {
        running: "Listing Asana workspace projects",
        done: "List Asana workspace projects",
      },
      asana_set_task_dependencies: {
        running: "Setting Asana task dependencies",
        done: "Set Asana task dependencies",
      },
      asana_set_task_dependents: {
        running: "Setting Asana task dependents",
        done: "Set Asana task dependents",
      },
      asana_set_parent_for_task: {
        running: "Setting Asana task parent",
        done: "Set Asana task parent",
      },
      asana_get_tasks: {
        running: "Listing Asana tasks",
        done: "List Asana tasks",
      },
      asana_add_task_followers: {
        running: "Adding Asana task followers",
        done: "Add Asana task followers",
      },
      asana_remove_task_followers: {
        running: "Removing Asana task followers",
        done: "Remove Asana task followers",
      },
      asana_get_teams_for_workspace: {
        running: "Listing Asana workspace teams",
        done: "List Asana workspace teams",
      },
      asana_get_teams_for_user: {
        running: "Listing Asana user teams",
        done: "List Asana user teams",
      },
      asana_get_time_period: {
        running: "Getting Asana time period",
        done: "Get Asana time period",
      },
      asana_get_time_periods: {
        running: "Listing Asana time periods",
        done: "List Asana time periods",
      },
      asana_typeahead_search: {
        running: "Searching Asana (typeahead)",
        done: "Search Asana (typeahead)",
      },
      asana_get_user: { running: "Getting Asana user", done: "Get Asana user" },
      asana_get_team_users: {
        running: "Listing Asana team users",
        done: "List Asana team users",
      },
      asana_get_workspace_users: {
        running: "Listing Asana workspace users",
        done: "List Asana workspace users",
      },
      asana_list_workspaces: {
        running: "Listing Asana workspaces",
        done: "List Asana workspaces",
      },
    },
  },
  {
    id: 10007,
    name: "Supabase",
    description:
      "Supabase tools for database management, real-time queries, and backend operations.",
    url: "https://mcp.supabase.com/mcp",
    icon: "SupabaseLogo",
    documentationUrl: "https://supabase.com/docs/guides/getting-started/mcp",
    connectionInstructions:
      "Supabase uses OAuth authentication with dynamic client registration. Natural language database queries and project management available.",
    authMethod: "oauth-dynamic",
    toolStakes: {},
  },
  {
    id: 10008,
    name: "Guru",
    description: "Guru tools for knowledge management and team collaboration.",
    url: "https://mcp.api.getguru.com/mcp",
    icon: "GuruLogo",
    authMethod: "oauth-dynamic",
    toolStakes: {
      guru_answer_generation: "never_ask",
      guru_create_draft: "low",
      guru_search_documents: "never_ask",
      guru_update_card: "low",
      guru_list_knowledge_agents: "never_ask",
      guru_get_card_by_id: "never_ask",
    },
    toolDisplayLabels: {
      guru_answer_generation: {
        running: "Generating Guru answer",
        done: "Generate Guru answer",
      },
      guru_create_draft: {
        running: "Creating Guru draft",
        done: "Create Guru draft",
      },
      guru_search_documents: {
        running: "Searching Guru documents",
        done: "Search Guru documents",
      },
      guru_update_card: {
        running: "Updating Guru card",
        done: "Update Guru card",
      },
      guru_list_knowledge_agents: {
        running: "Listing Guru knowledge agents",
        done: "List Guru knowledge agents",
      },
      guru_get_card_by_id: {
        running: "Getting Guru card",
        done: "Get Guru card",
      },
    },
  },
  {
    id: 10009,
    name: "Granola",
    description: "Granola tools for meeting notes and transcripts.",
    url: "https://mcp.granola.ai/mcp",
    icon: "GranolaLogo",
    authMethod: "oauth-dynamic",
    toolStakes: {
      query_granola_meetings: "never_ask",
      list_meetings: "never_ask",
      get_meetings: "never_ask",
      get_meeting_transcript: "never_ask",
    },
    toolDisplayLabels: {
      query_granola_meetings: {
        running: "Querying Granola meetings",
        done: "Query Granola meetings",
      },
      list_meetings: {
        running: "Listing Granola meetings",
        done: "List Granola meetings",
      },
      get_meetings: {
        running: "Getting Granola meetings",
        done: "Get Granola meetings",
      },
      get_meeting_transcript: {
        running: "Getting Granola transcript",
        done: "Get Granola transcript",
      },
    },
  },
  {
    id: 10010,
    name: "Intercom",
    description:
      "Access and manage support tickets, help center, and customer interactions.",
    url: "https://mcp.intercom.com/mcp",
    icon: "IntercomLogo",
    documentationUrl: "https://developers.intercom.com/docs/guides/mcp",
    connectionInstructions:
      "Intercom uses OAuth authentication with dynamic client registration. Search conversations and contacts, and get detailed information about customer interactions.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      search: "never_ask",
      fetch: "never_ask",
      search_conversations: "never_ask",
      get_conversation: "never_ask",
      search_contacts: "never_ask",
      get_contact: "never_ask",
    },
    toolDisplayLabels: {
      search: { running: "Searching Intercom", done: "Search Intercom" },
      fetch: { running: "Fetching Intercom data", done: "Fetch Intercom data" },
      search_conversations: {
        running: "Searching Intercom conversations",
        done: "Search Intercom conversations",
      },
      get_conversation: {
        running: "Getting Intercom conversation",
        done: "Get Intercom conversation",
      },
      search_contacts: {
        running: "Searching Intercom contacts",
        done: "Search Intercom contacts",
      },
      get_contact: {
        running: "Getting Intercom contact",
        done: "Get Intercom contact",
      },
    },
  },
  //Removed temporaly gitlab server
  /*
  {
    id: 10003,
    name: "gitlab",
    description:
      "GitLab tools for repository management, issue tracking, and CI/CD operations.",
    url: "https://gitlab.com/api/v4/mcp",
    icon: "GitlabLogo",
    documentationUrl:
      "https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_server/",
    connectionInstructions:
      "GitLab uses OAuth authentication with the 'mcp' scope. The default URL connects to gitlab.com.",
    authMethod: "oauth-dynamic",
    scope: "mcp",
    toolStakes: {
      get_mcp_server_version: "never_ask",
      create_issue: "low",
      get_issue: "never_ask",
      create_merge_request: "low",
      get_merge_request: "never_ask",
      get_merge_request_commits: "never_ask",
      get_merge_request_diffs: "never_ask",
      get_merge_request_pipelines: "never_ask",
      get_pipeline_jobs: "never_ask",
      gitlab_search: "never_ask",
      semantic_code_search: "never_ask",
    },
  },
  */
  //Removed temporaly see https://dust4ai.slack.com/archives/C050SM8NSPK/p1754397289272209
  /*
  {
    id: ? 10004,
    name: "Datadog",
    description:
      "Datadog tools for monitoring and observability (Region: US1).",
    url: "https://mcp.datadoghq.com/api/unstable/mcp-server/mcp",
    documentationUrl: "https://docs.datadoghq.com/bits_ai/mcp_server/?site=us1",
    icon: "MagnifyingGlassIcon",
    authMethod: "oauth",
    toolStakes: {
      ask_docs: "never_ask",
      get_active_hosts_count: "never_ask",
      get_eventsSearch: "never_ask",
      get_incident: "never_ask",
      get_metrics: "never_ask",
      get_monitors: "never_ask",
      get_synthetics_tests: "never_ask",
      get_trace: "never_ask",
      list_dashboards: "never_ask",
      list_hosts: "never_ask",
      list_incidents: "never_ask",
      list_metrics: "never_ask",
      list_services: "never_ask",
      list_spans: "never_ask",
      search_logs: "never_ask",
      search_rum_events: "never_ask",
    },
  },
  {
    id: ? 10005,
    name: "Datadog Europe",
    description:
      "Datadog tools for monitoring and observability (Region: EU1).",
    url: "https://mcp.datadoghq.eu/api/unstable/mcp-server/mcp",
    documentationUrl: "https://docs.datadoghq.com/bits_ai/mcp_server/?site=eu1",
    icon: "MagnifyingGlassIcon",
    authMethod: "oauth",
    toolStakes: {
      ask_docs: "never_ask",
      get_active_hosts_count: "never_ask",
      get_eventsSearch: "never_ask",
      get_incident: "never_ask",
      get_metrics: "never_ask",
      get_monitors: "never_ask",
      get_synthetics_tests: "never_ask",
      get_trace: "never_ask",
      list_dashboards: "never_ask",
      list_hosts: "never_ask",
      list_incidents: "never_ask",
      list_metrics: "never_ask",
      list_services: "never_ask",
      list_spans: "never_ask",
      search_logs: "never_ask",
      search_rum_events: "never_ask",
    },
  },
  */
  {
    id: 10006,
    name: "Canva",
    description: "Canva tools for design capabilities.",
    url: "https://mcp.canva.com/mcp",
    icon: "CanvaLogo",
    documentationUrl:
      "https://www.canva.dev/docs/connect/canva-mcp-server-setup/",
    authMethod: "oauth-dynamic",
    toolStakes: {
      search_designs: "never_ask",
      get_design: "never_ask",
      get_design_pages: "never_ask",
      get_design_content: "never_ask",
      get_export_formats: "never_ask",
      list_folder_items: "never_ask",
      list_comments: "never_ask",
      list_replies: "never_ask",

      import_design_from_url: "low",
      export_design: "low",

      comment_on_design: "low",
      reply_to_comment: "low",

      create_folder: "low",
      move_item_to_folder: "low",
      upload_asset_from_url: "low",

      generate_design: "low",
      create_design_from_candidate: "low",
    },
    toolDisplayLabels: {
      search_designs: {
        running: "Searching Canva designs",
        done: "Search Canva designs",
      },
      get_design: { running: "Getting Canva design", done: "Get Canva design" },
      get_design_pages: {
        running: "Getting Canva design pages",
        done: "Get Canva design pages",
      },
      get_design_content: {
        running: "Getting Canva design content",
        done: "Get Canva design content",
      },
      get_export_formats: {
        running: "Getting Canva export formats",
        done: "Get Canva export formats",
      },
      list_folder_items: {
        running: "Listing Canva folder items",
        done: "List Canva folder items",
      },
      list_comments: {
        running: "Listing Canva comments",
        done: "List Canva comments",
      },
      list_replies: {
        running: "Listing Canva replies",
        done: "List Canva replies",
      },
      import_design_from_url: {
        running: "Importing Canva design",
        done: "Import Canva design",
      },
      export_design: {
        running: "Exporting Canva design",
        done: "Export Canva design",
      },
      comment_on_design: {
        running: "Commenting on Canva design",
        done: "Comment on Canva design",
      },
      reply_to_comment: {
        running: "Replying to Canva comment",
        done: "Reply to Canva comment",
      },
      create_folder: {
        running: "Creating Canva folder",
        done: "Create Canva folder",
      },
      move_item_to_folder: {
        running: "Moving Canva item to folder",
        done: "Move Canva item to folder",
      },
      upload_asset_from_url: {
        running: "Uploading Canva asset",
        done: "Upload Canva asset",
      },
      generate_design: {
        running: "Generating Canva design",
        done: "Generate Canva design",
      },
      create_design_from_candidate: {
        running: "Creating Canva design",
        done: "Create Canva design",
      },
    },
  },
];

export const isDefaultRemoteMcpServerURL = (url: string | undefined) => {
  return DEFAULT_REMOTE_MCP_SERVERS.some((server) => server.url === url);
};

export const getDefaultRemoteMCPServerByURL = (
  url: string | undefined
): DefaultRemoteMCPServerConfig | null => {
  return (
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    DEFAULT_REMOTE_MCP_SERVERS.find((server) => server.url === url) || null
  );
};

export const getDefaultRemoteMCPServerById = (
  id: number
): DefaultRemoteMCPServerConfig | null => {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  return DEFAULT_REMOTE_MCP_SERVERS.find((server) => server.id === id) || null;
};

export const getDefaultRemoteMCPServerByName = (
  name: string
): DefaultRemoteMCPServerConfig | null => {
  return (
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    DEFAULT_REMOTE_MCP_SERVERS.find((server) => server.name === name) || null
  );
};
