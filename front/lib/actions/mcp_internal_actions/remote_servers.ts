import type { InternalAllowedIconType } from "@app/components/resources/resources_icons";
import type { MCPOAuthUseCase } from "@app/types";

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
  toolStakes?: Record<string, "high" | "low" | "never_ask">;
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
  },
  //Removed temporaly see https://dust4ai.slack.com/archives/C050SM8NSPK/p1754397289272209
  /*
  {
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
