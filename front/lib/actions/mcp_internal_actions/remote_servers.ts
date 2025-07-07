import type { MCPOAuthUseCase } from "@app/types";

import type { InternalAllowedIconType } from "../mcp_icons";

export type DefaultRemoteMCPServerConfig = {
  id: number;
  name: string;
  description: string;
  url: string;
  icon: InternalAllowedIconType;
  documentationUrl?: string;
  connectionInstructions?: string;
  authMethod: "bearer" | "oauth" | null;
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
    url: "https://mcp.linear.app/sse",
    icon: "LinearLogo",
    documentationUrl: "https://linear.app/docs",
    authMethod: "oauth",
    toolStakes: {
      search_documentation: "never_ask",
      list_comments: "low",
      get_issue: "low",
      get_issue_git_branch_name: "low",
      list_issues: "low",
      list_issue_statuses: "low",
      get_issue_status: "low",
      list_my_issues: "low",
      list_issue_labels: "low",
      list_projects: "low",
      get_project: "never_ask",
      get_team: "low",
      list_users: "low",
      get_user: "low",

      create_comment: "high",
      get_document: "high",
      list_documents: "high",
      create_issue: "high",
      update_issue: "high",
      create_project: "high",
      update_project: "high",
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
    DEFAULT_REMOTE_MCP_SERVERS.find((server) => server.url === url) || null
  );
};

export const getDefaultRemoteMCPServerById = (
  id: number
): DefaultRemoteMCPServerConfig | null => {
  return DEFAULT_REMOTE_MCP_SERVERS.find((server) => server.id === id) || null;
};

export const getDefaultRemoteMCPServerByName = (
  name: string
): DefaultRemoteMCPServerConfig | null => {
  return (
    DEFAULT_REMOTE_MCP_SERVERS.find((server) => server.name === name) || null
  );
};
