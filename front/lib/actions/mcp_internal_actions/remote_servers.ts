import type { InternalAllowedIconType } from "@app/components/resources/resources_icons";
import type { ToolDisplayLabels } from "@app/lib/api/mcp";
import type {
  HostDerivedOAuthConfig,
  MCPOAuthUseCase,
} from "@app/types/oauth/lib";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export type DefaultRemoteMCPServerConfig = {
  id: number;
  name: string;
  description: string;
  url: string;
  icon: InternalAllowedIconType;
  documentationUrl?: string;
  connectionInstructions?: string;
  authMethod: "bearer" | "oauth-dynamic" | "oauth-static" | null;
  supportedOAuthUseCases?: MCPOAuthUseCase[];
  scope?: string;
  hostDerivedOAuth?: HostDerivedOAuthConfig;
  toolStakes?: Record<string, "high" | "low" | "medium" | "never_ask">;
  toolDisplayLabels?: Record<string, ToolDisplayLabels>;
  featureFlag?: WhitelistableFeature;
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
        running: "Checking Stripe docs",
        done: "Checked Stripe docs",
      },
      list_customers: {
        running: "Loading customers from Stripe",
        done: "Loaded customers from Stripe",
      },
      list_products: {
        running: "Loading products from Stripe",
        done: "Loaded products from Stripe",
      },
      list_prices: {
        running: "Loading prices from Stripe",
        done: "Loaded prices from Stripe",
      },
      list_invoices: {
        running: "Loading invoices from Stripe",
        done: "Loaded invoices from Stripe",
      },
      list_payment_intents: {
        running: "Loading payments from Stripe",
        done: "Loaded payments from Stripe",
      },
      list_subscriptions: {
        running: "Loading subscriptions from Stripe",
        done: "Loaded subscriptions from Stripe",
      },
      list_coupons: {
        running: "Loading coupons from Stripe",
        done: "Loaded coupons from Stripe",
      },
      list_disputes: {
        running: "Loading disputes from Stripe",
        done: "Loaded disputes from Stripe",
      },
      get_stripe_account_info: {
        running: "Checking account info on Stripe",
        done: "Checked account info on Stripe",
      },
      create_customer: {
        running: "Creating customer on Stripe",
        done: "Created customer on Stripe",
      },
      create_product: {
        running: "Creating product on Stripe",
        done: "Created product on Stripe",
      },
      create_price: {
        running: "Creating price on Stripe",
        done: "Created price on Stripe",
      },
      create_payment_link: {
        running: "Creating payment link on Stripe",
        done: "Created payment link on Stripe",
      },
      create_invoice: {
        running: "Creating invoice on Stripe",
        done: "Created invoice on Stripe",
      },
      create_invoice_item: {
        running: "Creating invoice item on Stripe",
        done: "Created invoice item on Stripe",
      },
      finalize_invoice: {
        running: "Finalizing invoice on Stripe",
        done: "Finalized invoice on Stripe",
      },
      retrieve_balance: {
        running: "Checking balance on Stripe",
        done: "Checked balance on Stripe",
      },
      create_refund: {
        running: "Creating refund on Stripe",
        done: "Created refund on Stripe",
      },
      cancel_subscription: {
        running: "Canceling subscription on Stripe",
        done: "Canceled subscription on Stripe",
      },
      update_subscription: {
        running: "Updating subscription on Stripe",
        done: "Updated subscription on Stripe",
      },
      create_coupon: {
        running: "Creating coupon on Stripe",
        done: "Created coupon on Stripe",
      },
      update_dispute: {
        running: "Updating dispute on Stripe",
        done: "Updated dispute on Stripe",
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
        running: "Searching docs on Linear",
        done: "Search docs on Linear",
      },
      list_comments: {
        running: "Listing comments on Linear",
        done: "List comments on Linear",
      },
      get_issue: {
        running: "Retrieving issue on Linear",
        done: "Retrieve issue on Linear",
      },
      get_issue_git_branch_name: {
        running: "Retrieving branch name on Linear",
        done: "Retrieve branch name on Linear",
      },
      list_issues: {
        running: "Listing issues on Linear",
        done: "List issues on Linear",
      },
      list_issue_statuses: {
        running: "Listing statuses on Linear",
        done: "List statuses on Linear",
      },
      get_issue_status: {
        running: "Retrieving issue status on Linear",
        done: "Retrieve issue status on Linear",
      },
      list_my_issues: {
        running: "Listing my issues on Linear",
        done: "List my issues on Linear",
      },
      list_issue_labels: {
        running: "Listing labels on Linear",
        done: "List labels on Linear",
      },
      list_projects: {
        running: "Listing projects on Linear",
        done: "List projects on Linear",
      },
      get_project: {
        running: "Retrieving project on Linear",
        done: "Retrieve project on Linear",
      },
      get_team: {
        running: "Retrieving team on Linear",
        done: "Retrieve team on Linear",
      },
      list_users: {
        running: "Listing users on Linear",
        done: "List users on Linear",
      },
      get_user: {
        running: "Retrieving user on Linear",
        done: "Retrieve user on Linear",
      },
      create_comment: {
        running: "Commenting on Linear",
        done: "Comment on Linear",
      },
      get_document: {
        running: "Retrieving document on Linear",
        done: "Retrieve document on Linear",
      },
      list_documents: {
        running: "Listing documents on Linear",
        done: "List documents on Linear",
      },
      create_issue: {
        running: "Creating issue on Linear",
        done: "Create issue on Linear",
      },
      update_issue: {
        running: "Updating issue on Linear",
        done: "Update issue on Linear",
      },
      create_project: {
        running: "Creating project on Linear",
        done: "Create project on Linear",
      },
      update_project: {
        running: "Updating project on Linear",
        done: "Update project on Linear",
      },
    },
  },
  {
    id: 10002,
    name: "Asana",
    description: "Asana tools for project management and issue tracking.",
    url: "https://mcp.asana.com/v2/mcp",
    icon: "AsanaLogo",
    documentationUrl:
      "https://developers.asana.com/docs/using-asanas-mcp-server",
    authMethod: "oauth-static",
    scope: "default",
    supportedOAuthUseCases: ["platform_actions", "personal_actions"],
    toolStakes: {
      search_objects: "never_ask",
      search_tasks: "never_ask",
      get_status_overview: "never_ask",
      get_task: "never_ask",
      get_tasks: "never_ask",
      create_task: "low",
      update_task: "low",
      create_project: "low",
      get_project: "never_ask",
      get_projects: "never_ask",
      get_portfolio: "never_ask",
      get_portfolios: "never_ask",
      get_items_for_portfolio: "never_ask",
      get_user: "never_ask",
      get_workspace_users: "never_ask",
    },
    toolDisplayLabels: {
      search_objects: {
        running: "Searching objects on Asana",
        done: "Search objects on Asana",
      },
      search_tasks: {
        running: "Searching tasks on Asana",
        done: "Search tasks on Asana",
      },
      get_status_overview: {
        running: "Retrieving status overview on Asana",
        done: "Retrieve status overview on Asana",
      },
      get_task: {
        running: "Retrieving task on Asana",
        done: "Retrieve task on Asana",
      },
      get_tasks: {
        running: "Listing tasks on Asana",
        done: "List tasks on Asana",
      },
      create_task: {
        running: "Creating task on Asana",
        done: "Create task on Asana",
      },
      update_task: {
        running: "Updating task on Asana",
        done: "Update task on Asana",
      },
      create_project: {
        running: "Creating project on Asana",
        done: "Create project on Asana",
      },
      get_project: {
        running: "Retrieving project on Asana",
        done: "Retrieve project on Asana",
      },
      get_projects: {
        running: "Listing projects on Asana",
        done: "List projects on Asana",
      },
      get_portfolio: {
        running: "Retrieving portfolio on Asana",
        done: "Retrieve portfolio on Asana",
      },
      get_portfolios: {
        running: "Listing portfolios on Asana",
        done: "List portfolios on Asana",
      },
      get_items_for_portfolio: {
        running: "Retrieving portfolio items on Asana",
        done: "Retrieve portfolio items on Asana",
      },
      get_user: {
        running: "Retrieving user on Asana",
        done: "Retrieve user on Asana",
      },
      get_workspace_users: {
        running: "Listing workspace users on Asana",
        done: "List workspace users on Asana",
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
        running: "Generating answer on Guru",
        done: "Generate answer on Guru",
      },
      guru_create_draft: {
        running: "Creating draft on Guru",
        done: "Create draft on Guru",
      },
      guru_search_documents: {
        running: "Searching documents on Guru",
        done: "Search documents on Guru",
      },
      guru_update_card: {
        running: "Updating card on Guru",
        done: "Update card on Guru",
      },
      guru_list_knowledge_agents: {
        running: "Listing knowledge agents on Guru",
        done: "List knowledge agents on Guru",
      },
      guru_get_card_by_id: {
        running: "Retrieving card on Guru",
        done: "Retrieve card on Guru",
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
        running: "Querying meetings on Granola",
        done: "Query meetings on Granola",
      },
      list_meetings: {
        running: "Listing meetings on Granola",
        done: "List meetings on Granola",
      },
      get_meetings: {
        running: "Retrieving meetings on Granola",
        done: "Retrieve meetings on Granola",
      },
      get_meeting_transcript: {
        running: "Retrieving transcript on Granola",
        done: "Retrieve transcript on Granola",
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
      "Only available for US-hosted Intercom workspaces. Intercom uses OAuth authentication with dynamic client registration. Search conversations and contacts, and get detailed information about customer interactions.",
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
      search: {
        running: "Searching on Intercom",
        done: "Search on Intercom",
      },
      fetch: {
        running: "Fetching data on Intercom",
        done: "Fetch data on Intercom",
      },
      search_conversations: {
        running: "Searching conversations on Intercom",
        done: "Search conversations on Intercom",
      },
      get_conversation: {
        running: "Retrieving conversation on Intercom",
        done: "Retrieve conversation on Intercom",
      },
      search_contacts: {
        running: "Searching contacts on Intercom",
        done: "Search contacts on Intercom",
      },
      get_contact: {
        running: "Retrieving contact on Intercom",
        done: "Retrieve contact on Intercom",
      },
    },
  },
  {
    id: 10011,
    name: "Attio",
    description:
      "Attio CRM tools for managing contacts, companies, deals, notes, and tasks.",
    url: "https://mcp.attio.com/mcp",
    icon: "AttioLogo",
    documentationUrl: "https://docs.attio.com/mcp/overview",
    authMethod: "oauth-dynamic",
    toolStakes: {
      // Read operations - auto-approved for smooth UX
      "search-records": "never_ask",
      "get-records-by-ids": "never_ask",
      "list-attribute-definitions": "never_ask",
      "search-notes-by-metadata": "never_ask",
      "semantic-search-notes": "never_ask",
      "get-note-body": "never_ask",
      "search-meetings": "never_ask",
      "search-call-recordings-by-metadata": "never_ask",
      "semantic-search-call-recordings": "never_ask",
      "get-call-recording": "never_ask",
      "search-emails-by-metadata": "never_ask",
      "semantic-search-emails": "never_ask",
      "get-email-content": "never_ask",
      "list-workspace-members": "never_ask",
      "list-workspace-teams": "never_ask",
      whoami: "never_ask",

      // Write operations - require user confirmation
      "create-record": "high",
      "upsert-record": "high",
      "create-note": "low",
      "create-task": "low",
      "update-task": "low",
    },
    toolDisplayLabels: {
      "search-records": {
        running: "Searching records on Attio",
        done: "Search records on Attio",
      },
      "get-records-by-ids": {
        running: "Retrieving records on Attio",
        done: "Retrieve records on Attio",
      },
      "list-attribute-definitions": {
        running: "Listing attributes on Attio",
        done: "List attributes on Attio",
      },
      "search-notes-by-metadata": {
        running: "Searching notes on Attio",
        done: "Search notes on Attio",
      },
      "semantic-search-notes": {
        running: "Searching notes (semantic) on Attio",
        done: "Search notes (semantic) on Attio",
      },
      "get-note-body": {
        running: "Retrieving note on Attio",
        done: "Retrieve note on Attio",
      },
      "search-meetings": {
        running: "Searching meetings on Attio",
        done: "Search meetings on Attio",
      },
      "search-call-recordings-by-metadata": {
        running: "Searching call recordings on Attio",
        done: "Search call recordings on Attio",
      },
      "semantic-search-call-recordings": {
        running: "Searching call recordings (semantic) on Attio",
        done: "Search call recordings (semantic) on Attio",
      },
      "get-call-recording": {
        running: "Retrieving call recording on Attio",
        done: "Retrieve call recording on Attio",
      },
      "search-emails-by-metadata": {
        running: "Searching emails on Attio",
        done: "Search emails on Attio",
      },
      "semantic-search-emails": {
        running: "Searching emails (semantic) on Attio",
        done: "Search emails (semantic) on Attio",
      },
      "get-email-content": {
        running: "Retrieving email on Attio",
        done: "Retrieve email on Attio",
      },
      "list-workspace-members": {
        running: "Listing workspace members on Attio",
        done: "List workspace members on Attio",
      },
      "list-workspace-teams": {
        running: "Listing workspace teams on Attio",
        done: "List workspace teams on Attio",
      },
      whoami: {
        running: "Checking user info on Attio",
        done: "Check user info on Attio",
      },
      "create-record": {
        running: "Creating record on Attio",
        done: "Create record on Attio",
      },
      "upsert-record": {
        running: "Upserting record on Attio",
        done: "Upsert record on Attio",
      },
      "create-note": {
        running: "Creating note on Attio",
        done: "Create note on Attio",
      },
      "create-task": {
        running: "Creating task on Attio",
        done: "Create task on Attio",
      },
      "update-task": {
        running: "Updating task on Attio",
        done: "Update task on Attio",
      },
    },
  },
  {
    id: 10012,
    name: "Miro",
    description:
      "Miro tools for collaborative whiteboarding, diagramming, and visual workspace management.",
    url: "https://mcp.miro.com/",
    icon: "MiroLogo",
    documentationUrl: "https://developers.miro.com/docs/miro-mcp",
    connectionInstructions:
      "Miro uses OAuth 2.1 with dynamic client registration. Authentication is team-level — you will be prompted to select your Miro team during sign-in. Enterprise plan users need an admin to enable MCP access first.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      board_list_items: "never_ask",
      context_explore: "never_ask",
      context_get: "never_ask",
      diagram_get_dsl: "never_ask",
      doc_get: "never_ask",
      image_get_url: "never_ask",
      image_get_data: "never_ask",
      table_list_rows: "never_ask",

      diagram_create: "low",
      doc_create: "low",
      doc_update: "low",
      table_create: "low",
      table_sync_rows: "low",
    },
    toolDisplayLabels: {
      board_list_items: {
        running: "Listing board items on Miro",
        done: "List board items on Miro",
      },
      context_explore: {
        running: "Exploring board on Miro",
        done: "Explore board on Miro",
      },
      context_get: {
        running: "Reading board content on Miro",
        done: "Read board content on Miro",
      },
      diagram_get_dsl: {
        running: "Fetching diagram format on Miro",
        done: "Fetch diagram format on Miro",
      },
      doc_get: {
        running: "Reading doc on Miro",
        done: "Read doc on Miro",
      },
      image_get_url: {
        running: "Retrieving image URL on Miro",
        done: "Retrieve image URL on Miro",
      },
      image_get_data: {
        running: "Retrieving image on Miro",
        done: "Retrieve image on Miro",
      },
      table_list_rows: {
        running: "Listing table rows on Miro",
        done: "List table rows on Miro",
      },
      diagram_create: {
        running: "Creating diagram on Miro",
        done: "Create diagram on Miro",
      },
      doc_create: {
        running: "Creating doc on Miro",
        done: "Create doc on Miro",
      },
      doc_update: {
        running: "Updating doc on Miro",
        done: "Update doc on Miro",
      },
      table_create: {
        running: "Creating table on Miro",
        done: "Create table on Miro",
      },
      table_sync_rows: {
        running: "Syncing table rows on Miro",
        done: "Sync table rows on Miro",
      },
    },
  },
  {
    id: 10013,
    name: "Semrush",
    description:
      "Semrush tools for SEO research, keyword analysis, competitor insights, and digital marketing data.",
    url: "https://mcp.semrush.com/v1/mcp",
    icon: "SemrushLogo",
    documentationUrl: "https://developer.semrush.com/api/basics/semrush-mcp/",
    authMethod: "oauth-dynamic",
    toolStakes: {
      trends_research: "never_ask",
      organic_research: "never_ask",
      backlink_research: "never_ask",
      keyword_research: "never_ask",
      overview_research: "never_ask",
      subdomain_research: "never_ask",
      subfolder_research: "never_ask",
      tracking_research: "never_ask",
      projects_research: "never_ask",
      url_research: "never_ask",
      siteaudit_research: "never_ask",
      get_report_schema: "never_ask",
      execute_report: "low", // only tool that consumes Semrush API units; all others are discovery only
    },
    toolDisplayLabels: {
      trends_research: {
        running: "Fetching trends on Semrush",
        done: "Fetch trends on Semrush",
      },
      organic_research: {
        running: "Analyzing organic search on Semrush",
        done: "Analyze organic search on Semrush",
      },
      backlink_research: {
        running: "Analyzing backlinks on Semrush",
        done: "Analyze backlinks on Semrush",
      },
      keyword_research: {
        running: "Researching keywords on Semrush",
        done: "Research keywords on Semrush",
      },
      overview_research: {
        running: "Fetching domain overview on Semrush",
        done: "Fetch domain overview on Semrush",
      },
      subdomain_research: {
        running: "Analyzing subdomains on Semrush",
        done: "Analyze subdomains on Semrush",
      },
      subfolder_research: {
        running: "Analyzing subfolders on Semrush",
        done: "Analyze subfolders on Semrush",
      },
      tracking_research: {
        running: "Fetching position tracking on Semrush",
        done: "Fetch position tracking on Semrush",
      },
      projects_research: {
        running: "Fetching projects on Semrush",
        done: "Fetch projects on Semrush",
      },
      url_research: {
        running: "Analyzing URL on Semrush",
        done: "Analyze URL on Semrush",
      },
      siteaudit_research: {
        running: "Running site audit on Semrush",
        done: "Run site audit on Semrush",
      },
      get_report_schema: {
        running: "Fetching report schema on Semrush",
        done: "Fetch report schema on Semrush",
      },
      execute_report: {
        running: "Executing report on Semrush",
        done: "Execute report on Semrush",
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
    icon: "DatadogLogo",
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
    icon: "DatadogLogo",
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
    id: 10014,
    name: "Hex",
    description: "Hex tools for data analytics and project search.",
    url: "https://app.hex.tech/mcp",
    icon: "HexLogo",
    documentationUrl: "https://learn.hex.tech/docs/administration/mcp-server",
    authMethod: "oauth-dynamic",
    toolStakes: {
      search_projects: "never_ask",
      get_thread: "never_ask",
      create_thread: "low",
      continue_thread: "low",
    },
    toolDisplayLabels: {
      search_projects: {
        running: "Searching projects on Hex",
        done: "Search projects on Hex",
      },
      get_thread: {
        running: "Retrieving thread on Hex",
        done: "Retrieve thread on Hex",
      },
      create_thread: {
        running: "Creating thread on Hex",
        done: "Create thread on Hex",
      },
      continue_thread: {
        running: "Continuing thread on Hex",
        done: "Continue thread on Hex",
      },
    },
  },
  {
    id: 10015,
    name: "Power BI",
    description:
      "Query Power BI semantic models, retrieve schemas, and execute DAX queries directly from your conversations.",
    url: "https://api.fabric.microsoft.com/v1/mcp/powerbi",
    icon: "PowerBiLogo",
    documentationUrl: "https://docs.dust.tt/docs/power-bi",
    featureFlag: "power_bi_mcp",
    authMethod: "oauth-static",
    scope: "https://analysis.windows.net/powerbi/api/.default offline_access",
    supportedOAuthUseCases: ["platform_actions", "personal_actions"],
    toolStakes: {
      get_reports: "never_ask",
      get_datasets: "never_ask",
      get_dashboards: "never_ask",
      get_tiles: "never_ask",
      execute_queries: "never_ask",
      refresh_dataset: "low",
    },
    toolDisplayLabels: {
      get_reports: {
        running: "Fetching reports on Power BI",
        done: "Fetch reports on Power BI",
      },
      get_datasets: {
        running: "Fetching datasets on Power BI",
        done: "Fetch datasets on Power BI",
      },
      get_dashboards: {
        running: "Fetching dashboards on Power BI",
        done: "Fetch dashboards on Power BI",
      },
      get_tiles: {
        running: "Fetching tiles on Power BI",
        done: "Fetch tiles on Power BI",
      },
      execute_queries: {
        running: "Executing query on Power BI",
        done: "Execute query on Power BI",
      },
      refresh_dataset: {
        running: "Refreshing dataset on Power BI",
        done: "Refresh dataset on Power BI",
      },
    },
  },
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
        running: "Searching designs on Canva",
        done: "Search designs on Canva",
      },
      get_design: {
        running: "Retrieving design on Canva",
        done: "Retrieve design on Canva",
      },
      get_design_pages: {
        running: "Retrieving design pages on Canva",
        done: "Retrieve design pages on Canva",
      },
      get_design_content: {
        running: "Retrieving design content on Canva",
        done: "Retrieve design content on Canva",
      },
      get_export_formats: {
        running: "Retrieving export formats on Canva",
        done: "Retrieve export formats on Canva",
      },
      list_folder_items: {
        running: "Listing folder items on Canva",
        done: "List folder items on Canva",
      },
      list_comments: {
        running: "Listing comments on Canva",
        done: "List comments on Canva",
      },
      list_replies: {
        running: "Listing replies on Canva",
        done: "List replies on Canva",
      },
      import_design_from_url: {
        running: "Importing design on Canva",
        done: "Import design on Canva",
      },
      export_design: {
        running: "Exporting design on Canva",
        done: "Export design on Canva",
      },
      comment_on_design: {
        running: "Commenting on Canva",
        done: "Comment on Canva",
      },
      reply_to_comment: {
        running: "Replying to comment on Canva",
        done: "Reply to comment on Canva",
      },
      create_folder: {
        running: "Creating folder on Canva",
        done: "Create folder on Canva",
      },
      move_item_to_folder: {
        running: "Moving item to folder on Canva",
        done: "Move item to folder on Canva",
      },
      upload_asset_from_url: {
        running: "Uploading asset on Canva",
        done: "Upload asset on Canva",
      },
      generate_design: {
        running: "Generating design on Canva",
        done: "Generate design on Canva",
      },
      create_design_from_candidate: {
        running: "Creating design on Canva",
        done: "Create design on Canva",
      },
    },
  },
  {
    id: 10016,
    name: "Notion",
    description:
      "Notion tools for searching, creating, and managing pages, databases, and comments in your Notion workspace.",
    url: "https://mcp.notion.com/mcp",
    icon: "NotionLogo",
    documentationUrl:
      "https://developers.notion.com/guides/mcp/get-started-with-mcp",
    authMethod: "oauth-dynamic",
    toolStakes: {
      "notion-search": "never_ask",
      "notion-ai-search": "never_ask",
      "notion-fetch": "never_ask",
      "notion-get-tool-access": "never_ask",
      "notion-get-comments": "never_ask",
      "notion-get-teams": "never_ask",
      "notion-get-users": "never_ask",
      "notion-get-user": "never_ask",
      "notion-get-self": "never_ask",
      "notion-query-data-sources": "never_ask",
      "notion-query-database-view": "never_ask",
      "notion-create-pages": "low",
      "notion-update-page": "low",
      "notion-move-pages": "low",
      "notion-duplicate-page": "low",
      "notion-create-database": "low",
      "notion-update-data-source": "low",
      "notion-create-view": "low",
      "notion-update-view": "low",
      "notion-create-comment": "low",
    },
    toolDisplayLabels: {
      "notion-search": {
        running: "Searching in Notion",
        done: "Searched in Notion",
      },
      "notion-ai-search": {
        running: "Searching in Notion",
        done: "Searched in Notion",
      },
      "notion-fetch": {
        running: "Fetching from Notion",
        done: "Fetched from Notion",
      },
      "notion-get-tool-access": {
        running: "Checking Notion tool access",
        done: "Checked Notion tool access",
      },
      "notion-create-pages": {
        running: "Creating pages in Notion",
        done: "Created pages in Notion",
      },
      "notion-update-page": {
        running: "Updating page in Notion",
        done: "Updated page in Notion",
      },
      "notion-move-pages": {
        running: "Moving pages in Notion",
        done: "Moved pages in Notion",
      },
      "notion-duplicate-page": {
        running: "Duplicating page in Notion",
        done: "Duplicated page in Notion",
      },
      "notion-create-database": {
        running: "Creating database in Notion",
        done: "Created database in Notion",
      },
      "notion-update-data-source": {
        running: "Updating data source in Notion",
        done: "Updated data source in Notion",
      },
      "notion-create-view": {
        running: "Creating view in Notion",
        done: "Created view in Notion",
      },
      "notion-update-view": {
        running: "Updating view in Notion",
        done: "Updated view in Notion",
      },
      "notion-query-data-sources": {
        running: "Querying data sources in Notion",
        done: "Queried data sources in Notion",
      },
      "notion-query-database-view": {
        running: "Querying database view in Notion",
        done: "Queried database view in Notion",
      },
      "notion-create-comment": {
        running: "Creating comment in Notion",
        done: "Created comment in Notion",
      },
      "notion-get-comments": {
        running: "Loading comments from Notion",
        done: "Loaded comments from Notion",
      },
      "notion-get-teams": {
        running: "Loading teams from Notion",
        done: "Loaded teams from Notion",
      },
      "notion-get-users": {
        running: "Loading users from Notion",
        done: "Loaded users from Notion",
      },
      "notion-get-user": {
        running: "Loading user from Notion",
        done: "Loaded user from Notion",
      },
      "notion-get-self": {
        running: "Loading bot info from Notion",
        done: "Loaded bot info from Notion",
      },
    },
  },
  {
    id: 10017,
    name: "NetSuite",
    description:
      "NetSuite tools for querying records, running searches, and interacting with your NetSuite account via the AI Connector Service.",
    url: "",
    icon: "NetSuiteLogo",
    documentationUrl: "https://docs.dust.tt/docs/netsuite",
    authMethod: "oauth-static",
    supportedOAuthUseCases: ["platform_actions", "personal_actions"],
    scope: "mcp",
    featureFlag: "netsuite_mcp",
    toolStakes: {
      ns_getRecord: "never_ask",
      ns_getRecordTypeMetadata: "never_ask",
      ns_listAllReports: "never_ask",
      ns_runReport: "never_ask",
      ns_getSubsidiaries: "never_ask",
      ns_listSavedSearches: "never_ask",
      ns_runSavedSearch: "never_ask",
      ns_runCustomSuiteQL: "never_ask",
      ns_getSuiteQLMetadata: "never_ask",
      ns_createRecord: "high",
      ns_updateRecord: "high",
    },
    toolDisplayLabels: {
      ns_getRecord: {
        running: "Fetching record from NetSuite",
        done: "Fetched record from NetSuite",
      },
      ns_getRecordTypeMetadata: {
        running: "Fetching record type metadata from NetSuite",
        done: "Fetched record type metadata from NetSuite",
      },
      ns_listAllReports: {
        running: "Listing reports from NetSuite",
        done: "Listed reports from NetSuite",
      },
      ns_runReport: {
        running: "Running report on NetSuite",
        done: "Ran report on NetSuite",
      },
      ns_getSubsidiaries: {
        running: "Fetching subsidiaries from NetSuite",
        done: "Fetched subsidiaries from NetSuite",
      },
      ns_listSavedSearches: {
        running: "Listing saved searches from NetSuite",
        done: "Listed saved searches from NetSuite",
      },
      ns_runSavedSearch: {
        running: "Running saved search on NetSuite",
        done: "Ran saved search on NetSuite",
      },
      ns_runCustomSuiteQL: {
        running: "Running SuiteQL query on NetSuite",
        done: "Ran SuiteQL query on NetSuite",
      },
      ns_getSuiteQLMetadata: {
        running: "Fetching SuiteQL metadata from NetSuite",
        done: "Fetched SuiteQL metadata from NetSuite",
      },
      ns_createRecord: {
        running: "Creating record on NetSuite",
        done: "Created record on NetSuite",
      },
      ns_updateRecord: {
        running: "Updating record on NetSuite",
        done: "Updated record on NetSuite",
      },
    },
  },
  {
    id: 10018,
    name: "Amplitude",
    description:
      "Amplitude tools for product analytics — search, query, and create charts, dashboards, notebooks, experiments, and cohorts (Region: US).",
    url: "https://mcp.amplitude.com/mcp",
    icon: "AmplitudeLogo",
    documentationUrl: "https://amplitude.com/docs/amplitude-ai/amplitude-mcp",
    connectionInstructions:
      "Amplitude uses OAuth. You will be prompted to sign in with your Amplitude account. Access is scoped to the projects you already have permission to view. Admins can disable MCP access org-wide via Settings > Content Access > MCP.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      search: "never_ask",
      get_from_url: "never_ask",
      get_context: "never_ask",
      get_charts: "never_ask",
      get_dashboard: "never_ask",
      get_cohorts: "never_ask",
      get_experiments: "never_ask",
      get_event_properties: "never_ask",
      get_session_replays: "never_ask",
      get_users: "never_ask",
      query_chart: "never_ask",
      query_charts: "never_ask",
      query_dataset: "never_ask",
      query_experiment: "never_ask",
      get_feedback_insights: "never_ask",
      get_feedback_comments: "never_ask",
      get_feedback_mentions: "never_ask",
      get_feedback_sources: "never_ask",
      save_chart_edits: "low",
      create_chart: "low",
      create_dashboard: "low",
      create_notebook: "low",
      create_experiment: "low",
      create_cohort: "low",
    },
    toolDisplayLabels: {
      search: {
        running: "Searching on Amplitude",
        done: "Search on Amplitude",
      },
      get_from_url: {
        running: "Fetching from Amplitude URL",
        done: "Fetched from Amplitude URL",
      },
      get_context: {
        running: "Fetching context from Amplitude",
        done: "Fetched context from Amplitude",
      },
      get_charts: {
        running: "Fetching charts from Amplitude",
        done: "Fetched charts from Amplitude",
      },
      get_dashboard: {
        running: "Fetching dashboard from Amplitude",
        done: "Fetched dashboard from Amplitude",
      },
      get_cohorts: {
        running: "Fetching cohorts from Amplitude",
        done: "Fetched cohorts from Amplitude",
      },
      get_experiments: {
        running: "Fetching experiments from Amplitude",
        done: "Fetched experiments from Amplitude",
      },
      get_event_properties: {
        running: "Fetching event properties from Amplitude",
        done: "Fetched event properties from Amplitude",
      },
      get_session_replays: {
        running: "Fetching session replays from Amplitude",
        done: "Fetched session replays from Amplitude",
      },
      get_users: {
        running: "Fetching users from Amplitude",
        done: "Fetched users from Amplitude",
      },
      query_chart: {
        running: "Querying chart on Amplitude",
        done: "Queried chart on Amplitude",
      },
      query_charts: {
        running: "Querying charts on Amplitude",
        done: "Queried charts on Amplitude",
      },
      query_dataset: {
        running: "Querying dataset on Amplitude",
        done: "Queried dataset on Amplitude",
      },
      query_experiment: {
        running: "Querying experiment on Amplitude",
        done: "Queried experiment on Amplitude",
      },
      get_feedback_insights: {
        running: "Fetching feedback insights from Amplitude",
        done: "Fetched feedback insights from Amplitude",
      },
      get_feedback_comments: {
        running: "Fetching feedback comments from Amplitude",
        done: "Fetched feedback comments from Amplitude",
      },
      get_feedback_mentions: {
        running: "Fetching feedback mentions from Amplitude",
        done: "Fetched feedback mentions from Amplitude",
      },
      get_feedback_sources: {
        running: "Fetching feedback sources from Amplitude",
        done: "Fetched feedback sources from Amplitude",
      },
      save_chart_edits: {
        running: "Saving chart edits on Amplitude",
        done: "Saved chart edits on Amplitude",
      },
      create_chart: {
        running: "Creating chart on Amplitude",
        done: "Created chart on Amplitude",
      },
      create_dashboard: {
        running: "Creating dashboard on Amplitude",
        done: "Created dashboard on Amplitude",
      },
      create_notebook: {
        running: "Creating notebook on Amplitude",
        done: "Created notebook on Amplitude",
      },
      create_experiment: {
        running: "Creating experiment on Amplitude",
        done: "Created experiment on Amplitude",
      },
      create_cohort: {
        running: "Creating cohort on Amplitude",
        done: "Created cohort on Amplitude",
      },
    },
  },
  {
    id: 10019,
    name: "Amplitude Europe",
    description:
      "Amplitude tools for product analytics — search, query, and create charts, dashboards, notebooks, experiments, and cohorts (Region: EU).",
    url: "https://mcp.eu.amplitude.com/mcp",
    icon: "AmplitudeLogo",
    documentationUrl: "https://amplitude.com/docs/amplitude-ai/amplitude-mcp",
    connectionInstructions:
      "Amplitude uses OAuth. You will be prompted to sign in with your Amplitude account. Access is scoped to the projects you already have permission to view. Admins can disable MCP access org-wide via Settings > Content Access > MCP.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      search: "never_ask",
      get_from_url: "never_ask",
      get_context: "never_ask",
      get_charts: "never_ask",
      get_dashboard: "never_ask",
      get_cohorts: "never_ask",
      get_experiments: "never_ask",
      get_event_properties: "never_ask",
      get_session_replays: "never_ask",
      get_users: "never_ask",
      query_chart: "never_ask",
      query_charts: "never_ask",
      query_dataset: "never_ask",
      query_experiment: "never_ask",
      get_feedback_insights: "never_ask",
      get_feedback_comments: "never_ask",
      get_feedback_mentions: "never_ask",
      get_feedback_sources: "never_ask",
      save_chart_edits: "low",
      create_chart: "low",
      create_dashboard: "low",
      create_notebook: "low",
      create_experiment: "low",
      create_cohort: "low",
    },
    toolDisplayLabels: {
      search: {
        running: "Searching on Amplitude",
        done: "Search on Amplitude",
      },
      get_from_url: {
        running: "Fetching from Amplitude URL",
        done: "Fetched from Amplitude URL",
      },
      get_context: {
        running: "Fetching context from Amplitude",
        done: "Fetched context from Amplitude",
      },
      get_charts: {
        running: "Fetching charts from Amplitude",
        done: "Fetched charts from Amplitude",
      },
      get_dashboard: {
        running: "Fetching dashboard from Amplitude",
        done: "Fetched dashboard from Amplitude",
      },
      get_cohorts: {
        running: "Fetching cohorts from Amplitude",
        done: "Fetched cohorts from Amplitude",
      },
      get_experiments: {
        running: "Fetching experiments from Amplitude",
        done: "Fetched experiments from Amplitude",
      },
      get_event_properties: {
        running: "Fetching event properties from Amplitude",
        done: "Fetched event properties from Amplitude",
      },
      get_session_replays: {
        running: "Fetching session replays from Amplitude",
        done: "Fetched session replays from Amplitude",
      },
      get_users: {
        running: "Fetching users from Amplitude",
        done: "Fetched users from Amplitude",
      },
      query_chart: {
        running: "Querying chart on Amplitude",
        done: "Queried chart on Amplitude",
      },
      query_charts: {
        running: "Querying charts on Amplitude",
        done: "Queried charts on Amplitude",
      },
      query_dataset: {
        running: "Querying dataset on Amplitude",
        done: "Queried dataset on Amplitude",
      },
      query_experiment: {
        running: "Querying experiment on Amplitude",
        done: "Queried experiment on Amplitude",
      },
      get_feedback_insights: {
        running: "Fetching feedback insights from Amplitude",
        done: "Fetched feedback insights from Amplitude",
      },
      get_feedback_comments: {
        running: "Fetching feedback comments from Amplitude",
        done: "Fetched feedback comments from Amplitude",
      },
      get_feedback_mentions: {
        running: "Fetching feedback mentions from Amplitude",
        done: "Fetched feedback mentions from Amplitude",
      },
      get_feedback_sources: {
        running: "Fetching feedback sources from Amplitude",
        done: "Fetched feedback sources from Amplitude",
      },
      save_chart_edits: {
        running: "Saving chart edits on Amplitude",
        done: "Saved chart edits on Amplitude",
      },
      create_chart: {
        running: "Creating chart on Amplitude",
        done: "Created chart on Amplitude",
      },
      create_dashboard: {
        running: "Creating dashboard on Amplitude",
        done: "Created dashboard on Amplitude",
      },
      create_notebook: {
        running: "Creating notebook on Amplitude",
        done: "Created notebook on Amplitude",
      },
      create_experiment: {
        running: "Creating experiment on Amplitude",
        done: "Created experiment on Amplitude",
      },
      create_cohort: {
        running: "Creating cohort on Amplitude",
        done: "Created cohort on Amplitude",
      },
    },
  },
  {
    id: 10020,
    name: "Contentsquare",
    description:
      "Contentsquare tools for digital experience analytics — explore site metrics, funnels, journeys, page comparisons, and top errors across your projects.",
    url: "https://api.contentsquare.com/mcp",
    icon: "ContentsquareLogo",
    documentationUrl: "https://docs.dust.tt/docs/remote-mcp-server",
    connectionInstructions:
      "Contentsquare uses OAuth. You will be prompted to sign in with your Contentsquare account. Access is scoped to the projects you have permission to view.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      "list-projects": "never_ask",
      searchMappings: "never_ask",
      searchGoals: "never_ask",
      searchSegments: "never_ask",
      recommendMappings: "never_ask",
      recommendGoals: "never_ask",
      recommendPageGroups: "never_ask",
      recommendSegments: "never_ask",
      getPageGroupsForMapping: "never_ask",
      computeSiteMetrics: "never_ask",
      computeFunnel: "never_ask",
      computeImpact: "never_ask",
      computeJourney: "never_ask",
      computePageComparison: "never_ask",
      computePageGroupMetrics: "never_ask",
      getTopErrorsBySessionsWithErrors: "never_ask",
      getTopErrorsByImpactOnGoal: "never_ask",
      getTopErrorsByMissedOpportunity: "never_ask",
      getTopPageGroupsByLostConversions: "never_ask",
      getTopPagesBySessionsWithErrors: "never_ask",
      submitMcpFeedback: "low",
    },
    toolDisplayLabels: {
      "list-projects": {
        running: "Listing projects on Contentsquare",
        done: "Listed projects on Contentsquare",
      },
      searchMappings: {
        running: "Searching mappings on Contentsquare",
        done: "Searched mappings on Contentsquare",
      },
      searchGoals: {
        running: "Searching goals on Contentsquare",
        done: "Searched goals on Contentsquare",
      },
      searchSegments: {
        running: "Searching segments on Contentsquare",
        done: "Searched segments on Contentsquare",
      },
      recommendMappings: {
        running: "Recommending mappings on Contentsquare",
        done: "Recommended mappings on Contentsquare",
      },
      recommendGoals: {
        running: "Recommending goals on Contentsquare",
        done: "Recommended goals on Contentsquare",
      },
      recommendPageGroups: {
        running: "Recommending page groups on Contentsquare",
        done: "Recommended page groups on Contentsquare",
      },
      recommendSegments: {
        running: "Recommending segments on Contentsquare",
        done: "Recommended segments on Contentsquare",
      },
      getPageGroupsForMapping: {
        running: "Fetching page groups from Contentsquare",
        done: "Fetched page groups from Contentsquare",
      },
      computeSiteMetrics: {
        running: "Computing site metrics on Contentsquare",
        done: "Computed site metrics on Contentsquare",
      },
      computeFunnel: {
        running: "Computing funnel on Contentsquare",
        done: "Computed funnel on Contentsquare",
      },
      computeImpact: {
        running: "Computing impact on Contentsquare",
        done: "Computed impact on Contentsquare",
      },
      computeJourney: {
        running: "Computing journey on Contentsquare",
        done: "Computed journey on Contentsquare",
      },
      computePageComparison: {
        running: "Comparing pages on Contentsquare",
        done: "Compared pages on Contentsquare",
      },
      computePageGroupMetrics: {
        running: "Computing page group metrics on Contentsquare",
        done: "Computed page group metrics on Contentsquare",
      },
      getTopErrorsBySessionsWithErrors: {
        running: "Fetching top errors by sessions from Contentsquare",
        done: "Fetched top errors by sessions from Contentsquare",
      },
      getTopErrorsByImpactOnGoal: {
        running: "Fetching top errors by goal impact from Contentsquare",
        done: "Fetched top errors by goal impact from Contentsquare",
      },
      getTopErrorsByMissedOpportunity: {
        running: "Fetching top errors by missed opportunity from Contentsquare",
        done: "Fetched top errors by missed opportunity from Contentsquare",
      },
      getTopPageGroupsByLostConversions: {
        running:
          "Fetching top page groups by lost conversions from Contentsquare",
        done: "Fetched top page groups by lost conversions from Contentsquare",
      },
      getTopPagesBySessionsWithErrors: {
        running: "Fetching top pages by session errors from Contentsquare",
        done: "Fetched top pages by session errors from Contentsquare",
      },
      submitMcpFeedback: {
        running: "Submitting feedback to Contentsquare",
        done: "Submitted feedback to Contentsquare",
      },
    },
  },
  {
    id: 10021,
    name: "Praiz",
    description:
      "Praiz tools to search and read your meetings, calls, and transcripts — keep your CRM and team in sync with your customer conversations.",
    url: "https://mcp.praiz.io/mcp",
    icon: "PraizLogo",
    documentationUrl: "https://docs.dust.tt/docs/remote-mcp-server",
    connectionInstructions:
      "Praiz uses OAuth. You will be prompted to sign in with your Praiz account and approve the requested scopes directly from the Dust chat.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      search: "never_ask",
      fetch: "never_ask",
      list_videos: "never_ask",
      search_videos: "never_ask",
      get_video: "never_ask",
      get_video_transcript: "never_ask",
      get_transcript_around: "never_ask",
      get_video_timeline: "never_ask",
      list_comments: "never_ask",
      list_participants: "never_ask",
      search_participants: "never_ask",
      list_templates: "never_ask",
      get_template_fields: "never_ask",
      get_template_values: "never_ask",
      list_users: "never_ask",
      list_teams: "never_ask",
      list_tags: "never_ask",
      list_playlists: "never_ask",
      usage_stats: "never_ask",
    },
    toolDisplayLabels: {
      search: {
        running: "Searching on Praiz",
        done: "Searched on Praiz",
      },
      fetch: {
        running: "Fetching record from Praiz",
        done: "Fetched record from Praiz",
      },
      list_videos: {
        running: "Listing videos on Praiz",
        done: "Listed videos on Praiz",
      },
      search_videos: {
        running: "Searching videos on Praiz",
        done: "Searched videos on Praiz",
      },
      get_video: {
        running: "Fetching video from Praiz",
        done: "Fetched video from Praiz",
      },
      get_video_transcript: {
        running: "Fetching transcript from Praiz",
        done: "Fetched transcript from Praiz",
      },
      get_transcript_around: {
        running: "Fetching transcript segment from Praiz",
        done: "Fetched transcript segment from Praiz",
      },
      get_video_timeline: {
        running: "Fetching timeline from Praiz",
        done: "Fetched timeline from Praiz",
      },
      list_comments: {
        running: "Listing comments on Praiz",
        done: "Listed comments on Praiz",
      },
      list_participants: {
        running: "Listing participants on Praiz",
        done: "Listed participants on Praiz",
      },
      search_participants: {
        running: "Searching participants on Praiz",
        done: "Searched participants on Praiz",
      },
      list_templates: {
        running: "Listing templates on Praiz",
        done: "Listed templates on Praiz",
      },
      get_template_fields: {
        running: "Fetching template fields from Praiz",
        done: "Fetched template fields from Praiz",
      },
      get_template_values: {
        running: "Fetching template values from Praiz",
        done: "Fetched template values from Praiz",
      },
      list_users: {
        running: "Listing users on Praiz",
        done: "Listed users on Praiz",
      },
      list_teams: {
        running: "Listing teams on Praiz",
        done: "Listed teams on Praiz",
      },
      list_tags: {
        running: "Listing tags on Praiz",
        done: "Listed tags on Praiz",
      },
      list_playlists: {
        running: "Listing playlists on Praiz",
        done: "Listed playlists on Praiz",
      },
      usage_stats: {
        running: "Fetching usage stats from Praiz",
        done: "Fetched usage stats from Praiz",
      },
    },
  },
  {
    id: 10022,
    name: "Costory",
    description:
      "Costory tools to explore cloud cost data, compare periods, set alerts, and share reports across AWS, GCP, Azure, Datadog, Anthropic, OpenAI, and more.",
    url: "https://app-api.costory.io/mcp",
    icon: "CostoryLogo",
    documentationUrl: "https://docs.costory.io/features/mcp",
    connectionInstructions:
      "Costory uses OAuth. You will be prompted to sign in with your Costory account in a browser window to authorize access.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      search: "never_ask",
      search_documentation: "never_ask",
      get_documentation_page: "never_ask",
      get_context: "never_ask",
      suggest_actions: "never_ask",
      suggest_groupby: "never_ask",
      suggest_usage_metrics: "never_ask",
      query: "never_ask",
      get: "never_ask",
      get_dashboard_widget_data: "never_ask",
      get_dashboard_widget_image: "never_ask",
      list_metrics: "never_ask",
      list_events: "never_ask",
      list_alerts: "never_ask",
      list_available_destinations: "never_ask",
      list_organizations: "never_ask",
      list_teams: "never_ask",
      list_tags: "never_ask",
      create_dashboard: "low",
      update_dashboard: "high",
      create_alert: "low",
      create_event: "low",
      create_report: "low",
    },
    toolDisplayLabels: {
      search: {
        running: "Searching on Costory",
        done: "Searched on Costory",
      },
      search_documentation: {
        running: "Searching Costory docs",
        done: "Searched Costory docs",
      },
      get_documentation_page: {
        running: "Fetching docs page from Costory",
        done: "Fetched docs page from Costory",
      },
      get_context: {
        running: "Loading workspace context from Costory",
        done: "Loaded workspace context from Costory",
      },
      suggest_actions: {
        running: "Suggesting actions on Costory",
        done: "Suggested actions on Costory",
      },
      suggest_groupby: {
        running: "Suggesting group-by on Costory",
        done: "Suggested group-by on Costory",
      },
      suggest_usage_metrics: {
        running: "Suggesting usage metrics on Costory",
        done: "Suggested usage metrics on Costory",
      },
      query: {
        running: "Querying costs on Costory",
        done: "Queried costs on Costory",
      },
      get: {
        running: "Fetching record from Costory",
        done: "Fetched record from Costory",
      },
      get_dashboard_widget_data: {
        running: "Fetching widget data from Costory",
        done: "Fetched widget data from Costory",
      },
      get_dashboard_widget_image: {
        running: "Rendering widget image on Costory",
        done: "Rendered widget image on Costory",
      },
      list_metrics: {
        running: "Listing metrics on Costory",
        done: "Listed metrics on Costory",
      },
      list_events: {
        running: "Listing events on Costory",
        done: "Listed events on Costory",
      },
      list_alerts: {
        running: "Listing alerts on Costory",
        done: "Listed alerts on Costory",
      },
      list_available_destinations: {
        running: "Listing destinations on Costory",
        done: "Listed destinations on Costory",
      },
      list_organizations: {
        running: "Listing organizations on Costory",
        done: "Listed organizations on Costory",
      },
      list_teams: {
        running: "Listing teams on Costory",
        done: "Listed teams on Costory",
      },
      list_tags: {
        running: "Listing tags on Costory",
        done: "Listed tags on Costory",
      },
      create_dashboard: {
        running: "Creating dashboard on Costory",
        done: "Created dashboard on Costory",
      },
      update_dashboard: {
        running: "Updating dashboard on Costory",
        done: "Updated dashboard on Costory",
      },
      create_alert: {
        running: "Creating alert on Costory",
        done: "Created alert on Costory",
      },
      create_event: {
        running: "Logging event on Costory",
        done: "Logged event on Costory",
      },
      create_report: {
        running: "Scheduling report on Costory",
        done: "Scheduled report on Costory",
      },
    },
  },
  {
    id: 10023,
    name: "Apify",
    description:
      "Apify tools to discover and run Actors (web scrapers and automations), read their outputs, and browse Apify storage.",
    url: "https://mcp.apify.com/",
    icon: "ApifyLogo",
    documentationUrl: "https://docs.apify.com/platform/integrations/mcp",
    connectionInstructions:
      "Apify uses OAuth. You will be prompted to sign in with your Apify account in a browser window to authorize access.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      "search-actors": "never_ask",
      "fetch-actor-details": "never_ask",
      "get-actor-run": "never_ask",
      "get-dataset-items": "never_ask",
      "get-key-value-store-record": "never_ask",
      "search-apify-docs": "never_ask",
      "fetch-apify-docs": "never_ask",
      "call-actor": "low",
      "abort-actor-run": "low",
      "apify--rag-web-browser": "low",
    },
    toolDisplayLabels: {
      "search-actors": {
        running: "Searching Actors on Apify",
        done: "Searched Actors on Apify",
      },
      "fetch-actor-details": {
        running: "Fetching Actor details from Apify",
        done: "Fetched Actor details from Apify",
      },
      "get-actor-run": {
        running: "Fetching Actor run from Apify",
        done: "Fetched Actor run from Apify",
      },
      "get-dataset-items": {
        running: "Fetching dataset items from Apify",
        done: "Fetched dataset items from Apify",
      },
      "get-key-value-store-record": {
        running: "Fetching key-value record from Apify",
        done: "Fetched key-value record from Apify",
      },
      "search-apify-docs": {
        running: "Searching Apify docs",
        done: "Searched Apify docs",
      },
      "fetch-apify-docs": {
        running: "Fetching Apify docs page",
        done: "Fetched Apify docs page",
      },
      "call-actor": {
        running: "Running Actor on Apify",
        done: "Ran Actor on Apify",
      },
      "abort-actor-run": {
        running: "Aborting Actor run on Apify",
        done: "Aborted Actor run on Apify",
      },
      "apify--rag-web-browser": {
        running: "Browsing the web with Apify",
        done: "Browsed the web with Apify",
      },
    },
  },
  {
    id: 10024,
    name: "Gamma",
    description:
      "Create and manage Gamma presentations directly from your conversations.",
    url: "https://mcp.gamma.app/mcp",
    icon: "GammaLogo",
    documentationUrl: "https://developers.gamma.app",
    authMethod: "oauth-dynamic",
    toolStakes: {
      get_gammas: "never_ask",
      read_gamma: "never_ask",
      get_themes: "never_ask",
      get_folders: "never_ask",
      get_generation_status: "never_ask",
      generate: "low",
      generate_from_template: "low",
    },
    toolDisplayLabels: {
      get_gammas: {
        running: "Browsing Gammas",
        done: "Browsed Gammas",
      },
      read_gamma: {
        running: "Reading Gamma",
        done: "Read Gamma",
      },
      get_themes: {
        running: "Loading Gamma themes",
        done: "Loaded Gamma themes",
      },
      get_folders: {
        running: "Loading Gamma folders",
        done: "Loaded Gamma folders",
      },
      get_generation_status: {
        running: "Checking generation status",
        done: "Checked generation status",
      },
      generate: {
        running: "Generating Gamma presentation",
        done: "Generated Gamma presentation",
      },
      generate_from_template: {
        running: "Generating Gamma from template",
        done: "Generated Gamma from template",
      },
    },
  },
  {
    id: 10025,
    name: "Napta",
    description:
      "Napta tools for resource management and staffing — search employees, skills, and allocations, then create, update, and confirm assignments on projects.",
    url: "https://mcp.napta.io/mcp",
    icon: "NaptaLogo",
    documentationUrl: "https://docs.dust.tt/docs/remote-mcp-server",
    connectionInstructions:
      "Napta uses OAuth. You will be prompted to sign in with your Napta account in a browser window to authorize access.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      greet: "never_ask",
      get_business_units: "never_ask",
      get_positions: "never_ask",
      get_locations: "never_ask",
      get_tags: "never_ask",
      search_employees: "never_ask",
      search_skills: "never_ask",
      search_assignment: "never_ask",
      search_requests: "never_ask",
      find_employees_matching_requirements: "never_ask",
      create_request: "low",
      simulate_prebooking: "low",
      simulate_assignment: "low",

      create_assignment: "medium",
      update_assignment_workload: "medium",
      confirm_assignment: "high",
    },
    toolDisplayLabels: {
      greet: {
        running: "Connecting to Napta",
        done: "Connected to Napta",
      },
      get_business_units: {
        running: "Loading business units from Napta",
        done: "Loaded business units from Napta",
      },
      get_positions: {
        running: "Loading positions from Napta",
        done: "Loaded positions from Napta",
      },
      get_locations: {
        running: "Loading locations from Napta",
        done: "Loaded locations from Napta",
      },
      get_tags: {
        running: "Loading tags from Napta",
        done: "Loaded tags from Napta",
      },
      search_employees: {
        running: "Searching employees on Napta",
        done: "Searched employees on Napta",
      },
      search_skills: {
        running: "Searching skills on Napta",
        done: "Searched skills on Napta",
      },
      search_assignment: {
        running: "Searching assignments on Napta",
        done: "Searched assignments on Napta",
      },
      search_requests: {
        running: "Searching requests on Napta",
        done: "Searched requests on Napta",
      },
      find_employees_matching_requirements: {
        running: "Ranking contributors on Napta",
        done: "Ranked contributors on Napta",
      },
      create_request: {
        running: "Creating request on Napta",
        done: "Created request on Napta",
      },
      simulate_prebooking: {
        running: "Simulating prebooking on Napta",
        done: "Simulated prebooking on Napta",
      },
      simulate_assignment: {
        running: "Simulating assignment on Napta",
        done: "Simulated assignment on Napta",
      },
      create_assignment: {
        running: "Creating assignment on Napta",
        done: "Created assignment on Napta",
      },
      update_assignment_workload: {
        running: "Updating workload on Napta",
        done: "Updated workload on Napta",
      },
      confirm_assignment: {
        running: "Confirming assignment on Napta",
        done: "Confirmed assignment on Napta",
      },
    },
  },
  {
    id: 10026,
    name: "Lemlist",
    description:
      "Lemlist tools for sales engagement, creating outreach campaigns, and finding leads.",
    url: "https://app.lemlist.com/mcp",
    icon: "LemlistLogo",
    authMethod: "oauth-dynamic",
    supportedOAuthUseCases: ["personal_actions"],
    toolStakes: {
      // Read operations
      get_settings: "never_ask",
      get_statistics: "never_ask",
      get_team_info: "never_ask",
      get_team_overview: "never_ask",
      get_users: "never_ask",
      get_user_channels: "never_ask",
      get_campaigns: "never_ask",
      get_campaigns_reports: "never_ask",
      get_campaigns_stats: "never_ask",
      get_campaign_details: "never_ask",
      get_campaign_sequences: "never_ask",
      get_contact_lists: "never_ask",
      get_inbox_conversations: "never_ask",
      get_inbox_conversation: "never_ask",
      get_lemleads_filters: "never_ask",
      get_unsubscribes: "never_ask",
      get_webhooks: "never_ask",
      list_watch_lists: "never_ask",
      preview_sequence_update: "never_ask",
      validate_campaign_readiness: "never_ask",
      bulk_get_enrichment_results: "never_ask",
      check_domain_health: "never_ask",
      test_email_account: "never_ask",
      search_campaign_leads: "never_ask",
      search_contacts: "never_ask",
      search_companies: "never_ask",
      lemleads_search: "never_ask",
      load_skill: "never_ask",
      search_help_center: "never_ask",
      recall_memory: "never_ask",
      // Write operations
      add_leads_to_campaign: "low",
      add_contacts_to_list: "low",
      add_sequence_step: "low",
      add_unsubscribe: "low",
      bulk_enrich_data: "low",
      call_api: "low",
      connect_email_account: "low",
      create_campaign_with_sequence: "low",
      create_campaign_from_proposal: "low",
      create_contact_list: "low",
      create_or_update_company: "low",
      create_or_update_contact: "low",
      create_webhook: "low",
      delete_company: "low",
      delete_memory: "low",
      delete_sequence_step: "low",
      delete_unsubscribe: "low",
      delete_watch_list: "low",
      delete_webhook: "low",
      disconnect_email_account: "low",
      enrich_lead: "low",
      push_leads_to_contacts: "low",
      report_unsupported_case: "low",
      save_business_context: "low",
      save_memory: "low",
      send_message: "low",
      set_campaign_senders: "low",
      set_campaign_state: "low",
      update_lead: "low",
      update_lead_variables: "low",
      update_sequence_step: "low",
      update_settings: "low",
    },
  },
  {
    id: 10028,
    name: "Youtrust",
    description:
      "Youtrust tools for e-signature — search signature requests and templates, create draft requests from templates, and send them to signers.",
    url: "https://api.yousign.app/mcp",
    icon: "YoutrustLogo",
    documentationUrl:
      "https://help.yousign.app/en/articles/673715-connect-youtrust-to-your-ai-agent",
    connectionInstructions:
      "Youtrust uses OAuth 2.1 with dynamic client registration. You will be prompted to sign in with your Youtrust account in a browser window to authorize access.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      "search-signature-requests": "never_ask",
      "get-signature-request-activity-feed": "never_ask",
      "search-templates": "never_ask",
      "create-signature-request-from-template": "low",
      "send-signature-request": "high",
    },
    toolDisplayLabels: {
      "search-signature-requests": {
        running: "Searching signature requests on Youtrust",
        done: "Searched signature requests on Youtrust",
      },
      "get-signature-request-activity-feed": {
        running: "Fetching activity feed on Youtrust",
        done: "Fetched activity feed on Youtrust",
      },
      "search-templates": {
        running: "Searching templates on Youtrust",
        done: "Searched templates on Youtrust",
      },
      "create-signature-request-from-template": {
        running: "Creating signature request draft on Youtrust",
        done: "Created signature request draft on Youtrust",
      },
      "send-signature-request": {
        running: "Sending signature request on Youtrust",
        done: "Sent signature request on Youtrust",
      },
    },
  },
  {
    id: 10027,
    name: "Adomik",
    description:
      "Adomik tools for ad revenue analytics — explore programmatic advertising performance, reporting, and monetization data across your ad partners.",
    url: "https://mcp.adomik.com/mcp",
    icon: "AdomikLogo",
    documentationUrl: "https://docs.dust.tt/docs/remote-mcp-server",
    connectionInstructions:
      "Adomik uses OAuth. You will be prompted to sign in with your Adomik account in a browser window to authorize access.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      jp_market_analyst: "never_ask",
      confluence_search: "never_ask",
      confluence_get_page: "never_ask",
      confluence_get_page_children: "never_ask",
    },
    toolDisplayLabels: {
      jp_market_analyst: {
        running: "Analyzing market data on Adomik",
        done: "Analyzed market data on Adomik",
      },
      confluence_search: {
        running: "Searching knowledge base on Adomik",
        done: "Searched knowledge base on Adomik",
      },
      confluence_get_page: {
        running: "Fetching page from Adomik",
        done: "Fetched page from Adomik",
      },
      confluence_get_page_children: {
        running: "Fetching sub-pages from Adomik",
        done: "Fetched sub-pages from Adomik",
      },
    },
  },
  {
    id: 10029,
    name: "Modjo",
    description:
      "Modjo tools to read and analyze your sales calls, deals, accounts, contacts, transcripts, and conversation intelligence data.",
    url: "https://api.mcp.modjo.ai/v1/mcp",
    icon: "ModjoLogo",
    documentationUrl: "https://help.modjo.ai/articles/15459539",
    connectionInstructions:
      "Modjo uses OAuth. You will be prompted to sign in with your Modjo account; access respects the call, deal, and account permissions configured in Modjo.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      get_accounts: "never_ask",
      get_deals: "never_ask",
      get_calls: "never_ask",
      get_contacts: "never_ask",
      get_users: "never_ask",
      get_emails: "never_ask",
      semantic_search_activities: "never_ask",
      get_transcript: "never_ask",
      ask_anything_on_call: "never_ask",
      ask_anything_on_deal: "never_ask",
      ask_anything_on_account: "never_ask",
      get_agents: "never_ask",
    },
    toolDisplayLabels: {
      get_accounts: {
        running: "Searching accounts on Modjo",
        done: "Searched accounts on Modjo",
      },
      get_deals: {
        running: "Searching deals on Modjo",
        done: "Searched deals on Modjo",
      },
      get_calls: {
        running: "Searching calls on Modjo",
        done: "Searched calls on Modjo",
      },
      get_contacts: {
        running: "Searching contacts on Modjo",
        done: "Searched contacts on Modjo",
      },
      get_users: {
        running: "Searching users on Modjo",
        done: "Searched users on Modjo",
      },
      get_emails: {
        running: "Fetching emails from Modjo",
        done: "Fetched emails from Modjo",
      },
      semantic_search_activities: {
        running: "Searching activities on Modjo",
        done: "Searched activities on Modjo",
      },
      get_transcript: {
        running: "Fetching transcript from Modjo",
        done: "Fetched transcript from Modjo",
      },
      ask_anything_on_call: {
        running: "Analyzing call on Modjo",
        done: "Analyzed call on Modjo",
      },
      ask_anything_on_deal: {
        running: "Analyzing deal on Modjo",
        done: "Analyzed deal on Modjo",
      },
      ask_anything_on_account: {
        running: "Analyzing account on Modjo",
        done: "Analyzed account on Modjo",
      },
      get_agents: {
        running: "Listing agents on Modjo",
        done: "Listed agents on Modjo",
      },
    },
  },
  {
    id: 10030,
    name: "Databricks SQL",
    description:
      "Run SQL against your Databricks workspace through the official Databricks-managed SQL MCP server.",
    url: "",
    icon: "DatabricksLogo",
    documentationUrl:
      "https://docs.dust.tt/docs/user-documentation/agents/tools/databricks",
    connectionInstructions:
      "Enter your Databricks workspace host URL and the client ID/secret of a Databricks OAuth " +
      "app. The MCP URL and the OAuth authorization/token endpoints are derived automatically.",
    authMethod: "oauth-static",
    supportedOAuthUseCases: ["platform_actions", "personal_actions"],
    hostDerivedOAuth: {
      hostCredential: "databricks_workspace_url",
      hostLabel: "Databricks Workspace URL",
      hostHelpMessage:
        "Your Databricks workspace URL (e.g., https://your-workspace.cloud.databricks.com).",
      authorizationEndpointPath: "/oidc/v1/authorize",
      tokenEndpointPath: "/oidc/v1/token",
      scope: "sql offline_access",
      mcpUrlPathSuffix: "/api/2.0/mcp/sql",
    },
    toolStakes: {
      execute_sql: "high",
      execute_sql_read_only: "never_ask",
      poll_sql_result: "never_ask",
    },
  },
  {
    id: 10031,
    name: "Databricks Genie",
    description:
      "Ask questions about your Databricks data in natural language through the official Databricks-managed Genie MCP server.",
    url: "",
    icon: "DatabricksLogo",
    documentationUrl:
      "https://docs.dust.tt/docs/user-documentation/agents/tools/databricks",
    connectionInstructions:
      "Enter your Databricks workspace host URL and the client ID/secret of a Databricks OAuth " +
      "app. The MCP URL and the OAuth authorization/token endpoints are derived automatically.",
    authMethod: "oauth-static",
    supportedOAuthUseCases: ["platform_actions", "personal_actions"],
    hostDerivedOAuth: {
      hostCredential: "databricks_workspace_url",
      hostLabel: "Databricks Workspace URL",
      hostHelpMessage:
        "Your Databricks workspace URL (e.g., https://your-workspace.cloud.databricks.com).",
      authorizationEndpointPath: "/oidc/v1/authorize",
      tokenEndpointPath: "/oidc/v1/token",
      scope: "genie offline_access",
      mcpUrlPathSuffix: "/api/2.0/mcp/genie",
    },
    toolStakes: {
      genie_ask: "never_ask",
      genie_poll_response: "never_ask",
      genie_get_query_result: "never_ask",
    },
  },
  {
    id: 10032,
    name: "StackOne",
    description:
      "StackOne unified MCP gateway — discover and run actions across your organization's connected HR, ATS, CRM, finance, and IT systems (Workday, Greenhouse, Salesforce, NetSuite, and 500+ more) from one integration, scoped to each user's own linked accounts.",
    url: "https://mcp.stackone.com/mcp",
    icon: "StackOneLogo",
    documentationUrl: "https://docs.stackone.com/mcp",
    connectionInstructions:
      "StackOne uses OAuth with dynamic client registration. You will be prompted to sign in with your StackOne account in a browser window to authorize access.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      stackone_list_accounts: "never_ask",
      stackone_search_actions: "never_ask",
      stackone_execute_action: "high",
    },
    toolDisplayLabels: {
      stackone_list_accounts: {
        running: "Listing accounts on StackOne",
        done: "Listed accounts on StackOne",
      },
      stackone_search_actions: {
        running: "Searching actions on StackOne",
        done: "Searched actions on StackOne",
      },
      stackone_execute_action: {
        running: "Executing action on StackOne",
        done: "Executed action on StackOne",
      },
    },
  },
  {
    id: 10033,
    name: "Spendesk",
    description:
      "Spendesk tools for spend management: check cash and wallet funding, track payables, settlements, and purchase orders, analyze spend by supplier or cost centre, and manage suppliers, expense categories, and accounting exports.",
    url: "https://public-api.demo.spendesk.com/v1/mcp",
    icon: "SpendeskLogo",
    documentationUrl:
      "https://helpcenter.spendesk.com/en/articles/15052814-ask-your-spendesk-data-with-ai-mcp-getting-started-guide",
    connectionInstructions:
      "Spendesk uses OAuth with dynamic client registration. You will be prompted to sign in with your Spendesk account to authorize access. Access is restricted to Account Owners and Controllers.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      list_companies: "never_ask",
      get_wallet_summary: "never_ask",
      get_wallet_loads: "never_ask",
      get_settlements: "never_ask",
      get_payable_attachments: "never_ask",
      get_payable_by_id: "never_ask",
      get_payables: "never_ask",
      get_purchase_orders: "never_ask",
      get_supplier_by_id: "never_ask",
      get_analytical_fields: "never_ask",
      get_analytical_field_values: "never_ask",
      create_analytical_field: "high",
      update_analytical_field: "high",
      delete_analytical_field: "high",
      create_analytical_field_value: "high",
      update_analytical_field_value: "high",
      delete_analytical_field_value: "high",
      get_cost_centers: "never_ask",
      get_expense_categories: "never_ask",
      get_expense_category_fields: "never_ask",
      create_expense_category_field: "high",
      update_expense_category_field: "high",
      delete_expense_category_field: "high",
      create_expense_category: "high",
      update_expense_category: "high",
      delete_expense_category: "high",
      get_suppliers: "never_ask",
      archive_supplier: "high",
      create_suppliers: "high",
      update_supplier: "high",
      get_users: "never_ask",
      spendesk_analyze_spend: "never_ask",
      spendesk_analyze_requests: "never_ask",
      spendesk_analyze_settlements: "never_ask",
      spendesk_get_due_invoices: "never_ask",
      get_chart_of_accounts: "never_ask",
      create_accounts: "high",
      update_accounts: "high",
      delete_accounts: "high",
      list_cards: "never_ask",
      get_card: "never_ask",
      get_card_order: "never_ask",
      get_card_blocking_history: "never_ask",
      get_requests: "never_ask",
      get_request_by_id: "never_ask",
      get_transactions: "never_ask",
      mark_payable_as_exported_manually: "high",
      mark_settlement_as_exported_manually: "high",
      mark_payable_as_ready: "high",
      update_payable: "high",
      get_failed_transactions: "never_ask",
      create_purchase_order: "high",
      cancel_purchase_order: "high",
      close_purchase_order: "high",
      create_accounting_export: "high",
      get_accounting_export: "never_ask",
      get_journal_templates: "never_ask",
      get_invoices: "never_ask",
      get_invoice_by_id: "never_ask",
      get_invoices_summary: "never_ask",
      get_intakes: "never_ask",
      get_intake_by_id: "never_ask",
    },
    toolDisplayLabels: {
      list_companies: {
        running: "Listing companies on Spendesk",
        done: "List companies on Spendesk",
      },
      get_wallet_summary: {
        running: "Getting wallet summary on Spendesk",
        done: "Get wallet summary on Spendesk",
      },
      get_wallet_loads: {
        running: "Getting wallet loads on Spendesk",
        done: "Get wallet loads on Spendesk",
      },
      get_settlements: {
        running: "Getting settlements on Spendesk",
        done: "Get settlements on Spendesk",
      },
      get_payable_attachments: {
        running: "Getting payable attachments on Spendesk",
        done: "Get payable attachments on Spendesk",
      },
      get_payable_by_id: {
        running: "Getting payable on Spendesk",
        done: "Get payable on Spendesk",
      },
      get_payables: {
        running: "Getting payables on Spendesk",
        done: "Get payables on Spendesk",
      },
      get_purchase_orders: {
        running: "Getting purchase orders on Spendesk",
        done: "Get purchase orders on Spendesk",
      },
      get_supplier_by_id: {
        running: "Getting supplier on Spendesk",
        done: "Get supplier on Spendesk",
      },
      get_analytical_fields: {
        running: "Getting analytical fields on Spendesk",
        done: "Get analytical fields on Spendesk",
      },
      get_analytical_field_values: {
        running: "Getting analytical field values on Spendesk",
        done: "Get analytical field values on Spendesk",
      },
      create_analytical_field: {
        running: "Creating analytical field on Spendesk",
        done: "Create analytical field on Spendesk",
      },
      update_analytical_field: {
        running: "Updating analytical field on Spendesk",
        done: "Update analytical field on Spendesk",
      },
      delete_analytical_field: {
        running: "Deleting analytical field on Spendesk",
        done: "Delete analytical field on Spendesk",
      },
      create_analytical_field_value: {
        running: "Creating analytical field value on Spendesk",
        done: "Create analytical field value on Spendesk",
      },
      update_analytical_field_value: {
        running: "Updating analytical field value on Spendesk",
        done: "Update analytical field value on Spendesk",
      },
      delete_analytical_field_value: {
        running: "Deleting analytical field value on Spendesk",
        done: "Delete analytical field value on Spendesk",
      },
      get_cost_centers: {
        running: "Getting cost centers on Spendesk",
        done: "Get cost centers on Spendesk",
      },
      get_expense_categories: {
        running: "Getting expense categories on Spendesk",
        done: "Get expense categories on Spendesk",
      },
      get_expense_category_fields: {
        running: "Getting expense category fields on Spendesk",
        done: "Get expense category fields on Spendesk",
      },
      create_expense_category_field: {
        running: "Creating expense category field on Spendesk",
        done: "Create expense category field on Spendesk",
      },
      update_expense_category_field: {
        running: "Updating expense category field on Spendesk",
        done: "Update expense category field on Spendesk",
      },
      delete_expense_category_field: {
        running: "Deleting expense category field on Spendesk",
        done: "Delete expense category field on Spendesk",
      },
      create_expense_category: {
        running: "Creating expense category on Spendesk",
        done: "Create expense category on Spendesk",
      },
      update_expense_category: {
        running: "Updating expense category on Spendesk",
        done: "Update expense category on Spendesk",
      },
      delete_expense_category: {
        running: "Deleting expense category on Spendesk",
        done: "Delete expense category on Spendesk",
      },
      get_suppliers: {
        running: "Getting suppliers on Spendesk",
        done: "Get suppliers on Spendesk",
      },
      archive_supplier: {
        running: "Archiving supplier on Spendesk",
        done: "Archive supplier on Spendesk",
      },
      create_suppliers: {
        running: "Creating supplier on Spendesk",
        done: "Create supplier on Spendesk",
      },
      update_supplier: {
        running: "Updating supplier on Spendesk",
        done: "Update supplier on Spendesk",
      },
      get_users: {
        running: "Getting users on Spendesk",
        done: "Get users on Spendesk",
      },
      spendesk_analyze_spend: {
        running: "Analyzing spend on Spendesk",
        done: "Analyze spend on Spendesk",
      },
      spendesk_analyze_requests: {
        running: "Analyzing requests on Spendesk",
        done: "Analyze requests on Spendesk",
      },
      spendesk_analyze_settlements: {
        running: "Analyzing settlements on Spendesk",
        done: "Analyze settlements on Spendesk",
      },
      spendesk_get_due_invoices: {
        running: "Getting due invoices on Spendesk",
        done: "Get due invoices on Spendesk",
      },
      get_chart_of_accounts: {
        running: "Getting chart of accounts on Spendesk",
        done: "Get chart of accounts on Spendesk",
      },
      create_accounts: {
        running: "Creating account on Spendesk",
        done: "Create account on Spendesk",
      },
      update_accounts: {
        running: "Updating account on Spendesk",
        done: "Update account on Spendesk",
      },
      delete_accounts: {
        running: "Deleting account on Spendesk",
        done: "Delete account on Spendesk",
      },
      list_cards: {
        running: "Listing cards on Spendesk",
        done: "List cards on Spendesk",
      },
      get_card: {
        running: "Getting card on Spendesk",
        done: "Get card on Spendesk",
      },
      get_card_order: {
        running: "Getting card order on Spendesk",
        done: "Get card order on Spendesk",
      },
      get_card_blocking_history: {
        running: "Getting card blocking history on Spendesk",
        done: "Get card blocking history on Spendesk",
      },
      get_requests: {
        running: "Getting requests on Spendesk",
        done: "Get requests on Spendesk",
      },
      get_request_by_id: {
        running: "Getting request on Spendesk",
        done: "Get request on Spendesk",
      },
      get_transactions: {
        running: "Getting transactions on Spendesk",
        done: "Get transactions on Spendesk",
      },
      mark_payable_as_exported_manually: {
        running: "Marking payable as exported on Spendesk",
        done: "Mark payable as exported on Spendesk",
      },
      mark_settlement_as_exported_manually: {
        running: "Marking settlement as exported on Spendesk",
        done: "Mark settlement as exported on Spendesk",
      },
      mark_payable_as_ready: {
        running: "Marking payable as ready on Spendesk",
        done: "Mark payable as ready on Spendesk",
      },
      update_payable: {
        running: "Updating payable on Spendesk",
        done: "Update payable on Spendesk",
      },
      get_failed_transactions: {
        running: "Getting failed transactions on Spendesk",
        done: "Get failed transactions on Spendesk",
      },
      create_purchase_order: {
        running: "Creating purchase order on Spendesk",
        done: "Create purchase order on Spendesk",
      },
      cancel_purchase_order: {
        running: "Cancelling purchase order on Spendesk",
        done: "Cancel purchase order on Spendesk",
      },
      close_purchase_order: {
        running: "Closing purchase order on Spendesk",
        done: "Close purchase order on Spendesk",
      },
      create_accounting_export: {
        running: "Creating accounting export on Spendesk",
        done: "Create accounting export on Spendesk",
      },
      get_accounting_export: {
        running: "Getting accounting export on Spendesk",
        done: "Get accounting export on Spendesk",
      },
      get_journal_templates: {
        running: "Getting journal templates on Spendesk",
        done: "Get journal templates on Spendesk",
      },
      get_invoices: {
        running: "Getting invoices on Spendesk",
        done: "Get invoices on Spendesk",
      },
      get_invoice_by_id: {
        running: "Getting invoice on Spendesk",
        done: "Get invoice on Spendesk",
      },
      get_invoices_summary: {
        running: "Getting invoices summary on Spendesk",
        done: "Get invoices summary on Spendesk",
      },
      get_intakes: {
        running: "Getting intakes on Spendesk",
        done: "Get intakes on Spendesk",
      },
      get_intake_by_id: {
        running: "Getting intake on Spendesk",
        done: "Get intake on Spendesk",
      },
    },
  },
  {
    id: 10036,
    name: "Siit",
    description:
      "Siit tools to run your internal IT and HR service desk — requests, people, applications and equipment, services, knowledge base articles, workflows and app access approvals, scoped to your Siit permissions.",
    url: "https://mcp.siit.io/mcp",
    icon: "SiitLogo",
    documentationUrl: "https://docs.siit.io/integrations/mcp",
    connectionInstructions:
      'Siit uses OAuth with dynamic client registration. You will be prompted to sign in with your Siit account. The MCP can only read data you can already see and only perform writes you can already perform in the Siit admin dashboard, so make sure the "Public API" permission is enabled for your role under Settings > Roles & permissions in Siit.',
    authMethod: "oauth-dynamic",
    toolStakes: {
      send_feedback: "low",
      list_approval_policies: "never_ask",
      get_approval_policy: "never_ask",
      list_app_access_roles: "never_ask",
      get_app_access_role: "never_ask",
      get_app_access_role_provisioning_actions_schema: "never_ask",
      create_app_access_role: "high",
      update_app_access_role: "high",
      delete_app_access_role: "high",
      list_app_access_requests: "never_ask",
      get_app_access_request: "never_ask",
      approve_app_access_request: "high",
      reject_app_access_request: "high",
      list_people: "never_ask",
      get_person: "never_ask",
      whoami: "never_ask",
      create_person: "low",
      update_person: "low",
      archive_person: "high",
      unarchive_person: "low",
      merge_person: "high",
      list_requests: "never_ask",
      get_request: "never_ask",
      update_request: "low",
      archive_request: "high",
      unarchive_request: "low",
      create_request: "low",
      get_request_messages: "never_ask",
      get_request_events: "never_ask",
      send_request_message: "high",
      add_request_note: "low",
      get_request_group: "never_ask",
      get_request_group_events: "never_ask",
      group_requests: "low",
      rename_request_group: "low",
      disband_request_group: "high",
      add_requests_to_group: "low",
      remove_requests_from_group: "low",
      send_message_to_requests_in_group: "high",
      add_note_to_requests_in_group: "low",
      set_status_of_requests_in_group: "high",
      set_priority_of_requests_in_group: "low",
      set_assignee_of_requests_in_group: "low",
      add_tags_to_requests_in_group: "low",
      archive_requests_in_group: "high",
      snooze_requests_in_group: "low",
      get_request_agent_logs: "never_ask",
      list_services: "never_ask",
      get_services: "never_ask",
      create_service: "low",
      update_service: "low",
      get_service_custom_form_input: "never_ask",
      create_service_custom_form_input: "low",
      update_service_custom_form_input: "low",
      delete_service_custom_form_input: "high",
      list_team_inboxes: "never_ask",
      get_team_inbox: "never_ask",
      list_request_tags: "never_ask",
      get_request_tag: "never_ask",
      list_applications: "never_ask",
      get_application: "never_ask",
      create_application: "low",
      update_application: "low",
      archive_application: "high",
      unarchive_application: "low",
      list_equipments: "never_ask",
      get_equipment: "never_ask",
      create_equipment: "low",
      update_equipment: "low",
      archive_equipment: "high",
      unarchive_equipment: "low",
      list_equipment_categories: "never_ask",
      list_departments: "never_ask",
      get_department: "never_ask",
      list_legal_entities: "never_ask",
      get_legal_entity: "never_ask",
      list_office_locations: "never_ask",
      get_office_location: "never_ask",
      list_teams: "never_ask",
      get_team: "never_ask",
      list_article_categories: "never_ask",
      list_articles: "never_ask",
      get_article: "never_ask",
      create_article: "low",
      update_article: "low",
      publish_article: "high",
      unpublish_article: "high",
      archive_article: "high",
      unarchive_article: "low",
      list_workflows: "never_ask",
      get_workflow: "never_ask",
      get_workflow_execution_logs: "never_ask",
      get_workflow_manifest_schema: "never_ask",
      create_workflow: "high",
      update_workflow: "high",
      fetch_attachment: "never_ask",
    },
    toolDisplayLabels: {
      send_feedback: {
        running: "Sending feedback to Siit",
        done: "Sent feedback to Siit",
      },
      list_approval_policies: {
        running: "Listing approval policies on Siit",
        done: "Listed approval policies on Siit",
      },
      get_approval_policy: {
        running: "Fetching approval policy from Siit",
        done: "Fetched approval policy from Siit",
      },
      list_app_access_roles: {
        running: "Listing app access roles on Siit",
        done: "Listed app access roles on Siit",
      },
      get_app_access_role: {
        running: "Fetching app access role from Siit",
        done: "Fetched app access role from Siit",
      },
      get_app_access_role_provisioning_actions_schema: {
        running: "Fetching provisioning actions schema from Siit",
        done: "Fetched provisioning actions schema from Siit",
      },
      create_app_access_role: {
        running: "Creating app access role on Siit",
        done: "Created app access role on Siit",
      },
      update_app_access_role: {
        running: "Updating app access role on Siit",
        done: "Updated app access role on Siit",
      },
      delete_app_access_role: {
        running: "Deleting app access role on Siit",
        done: "Deleted app access role on Siit",
      },
      list_app_access_requests: {
        running: "Listing app access requests on Siit",
        done: "Listed app access requests on Siit",
      },
      get_app_access_request: {
        running: "Fetching app access request from Siit",
        done: "Fetched app access request from Siit",
      },
      approve_app_access_request: {
        running: "Approving app access request on Siit",
        done: "Approved app access request on Siit",
      },
      reject_app_access_request: {
        running: "Rejecting app access request on Siit",
        done: "Rejected app access request on Siit",
      },
      list_people: {
        running: "Listing people on Siit",
        done: "Listed people on Siit",
      },
      get_person: {
        running: "Fetching person from Siit",
        done: "Fetched person from Siit",
      },
      whoami: {
        running: "Fetching your Siit identity",
        done: "Fetched your Siit identity",
      },
      create_person: {
        running: "Creating person on Siit",
        done: "Created person on Siit",
      },
      update_person: {
        running: "Updating person on Siit",
        done: "Updated person on Siit",
      },
      archive_person: {
        running: "Archiving person on Siit",
        done: "Archived person on Siit",
      },
      unarchive_person: {
        running: "Unarchiving person on Siit",
        done: "Unarchived person on Siit",
      },
      merge_person: {
        running: "Merging people on Siit",
        done: "Merged people on Siit",
      },
      list_requests: {
        running: "Listing requests on Siit",
        done: "Listed requests on Siit",
      },
      get_request: {
        running: "Fetching request from Siit",
        done: "Fetched request from Siit",
      },
      update_request: {
        running: "Updating request on Siit",
        done: "Updated request on Siit",
      },
      archive_request: {
        running: "Archiving request on Siit",
        done: "Archived request on Siit",
      },
      unarchive_request: {
        running: "Unarchiving request on Siit",
        done: "Unarchived request on Siit",
      },
      create_request: {
        running: "Creating request on Siit",
        done: "Created request on Siit",
      },
      get_request_messages: {
        running: "Fetching request messages from Siit",
        done: "Fetched request messages from Siit",
      },
      get_request_events: {
        running: "Fetching request events from Siit",
        done: "Fetched request events from Siit",
      },
      send_request_message: {
        running: "Sending message on Siit request",
        done: "Sent message on Siit request",
      },
      add_request_note: {
        running: "Adding internal note on Siit request",
        done: "Added internal note on Siit request",
      },
      get_request_group: {
        running: "Fetching request group from Siit",
        done: "Fetched request group from Siit",
      },
      get_request_group_events: {
        running: "Fetching request group events from Siit",
        done: "Fetched request group events from Siit",
      },
      group_requests: {
        running: "Grouping requests on Siit",
        done: "Grouped requests on Siit",
      },
      rename_request_group: {
        running: "Renaming request group on Siit",
        done: "Renamed request group on Siit",
      },
      disband_request_group: {
        running: "Disbanding request group on Siit",
        done: "Disbanded request group on Siit",
      },
      add_requests_to_group: {
        running: "Adding requests to group on Siit",
        done: "Added requests to group on Siit",
      },
      remove_requests_from_group: {
        running: "Removing requests from group on Siit",
        done: "Removed requests from group on Siit",
      },
      send_message_to_requests_in_group: {
        running: "Sending message to grouped Siit requests",
        done: "Sent message to grouped Siit requests",
      },
      add_note_to_requests_in_group: {
        running: "Adding internal note to grouped Siit requests",
        done: "Added internal note to grouped Siit requests",
      },
      set_status_of_requests_in_group: {
        running: "Setting status of grouped Siit requests",
        done: "Set status of grouped Siit requests",
      },
      set_priority_of_requests_in_group: {
        running: "Setting priority of grouped Siit requests",
        done: "Set priority of grouped Siit requests",
      },
      set_assignee_of_requests_in_group: {
        running: "Setting assignee of grouped Siit requests",
        done: "Set assignee of grouped Siit requests",
      },
      add_tags_to_requests_in_group: {
        running: "Adding tags to grouped Siit requests",
        done: "Added tags to grouped Siit requests",
      },
      archive_requests_in_group: {
        running: "Archiving grouped Siit requests",
        done: "Archived grouped Siit requests",
      },
      snooze_requests_in_group: {
        running: "Snoozing grouped Siit requests",
        done: "Snoozed grouped Siit requests",
      },
      get_request_agent_logs: {
        running: "Fetching request agent logs from Siit",
        done: "Fetched request agent logs from Siit",
      },
      list_services: {
        running: "Listing services on Siit",
        done: "Listed services on Siit",
      },
      get_services: {
        running: "Fetching services from Siit",
        done: "Fetched services from Siit",
      },
      create_service: {
        running: "Creating service on Siit",
        done: "Created service on Siit",
      },
      update_service: {
        running: "Updating service on Siit",
        done: "Updated service on Siit",
      },
      get_service_custom_form_input: {
        running: "Fetching service form input from Siit",
        done: "Fetched service form input from Siit",
      },
      create_service_custom_form_input: {
        running: "Creating service form input on Siit",
        done: "Created service form input on Siit",
      },
      update_service_custom_form_input: {
        running: "Updating service form input on Siit",
        done: "Updated service form input on Siit",
      },
      delete_service_custom_form_input: {
        running: "Deleting service form input on Siit",
        done: "Deleted service form input on Siit",
      },
      list_team_inboxes: {
        running: "Listing team inboxes on Siit",
        done: "Listed team inboxes on Siit",
      },
      get_team_inbox: {
        running: "Fetching team inbox from Siit",
        done: "Fetched team inbox from Siit",
      },
      list_request_tags: {
        running: "Listing request tags on Siit",
        done: "Listed request tags on Siit",
      },
      get_request_tag: {
        running: "Fetching request tag from Siit",
        done: "Fetched request tag from Siit",
      },
      list_applications: {
        running: "Listing applications on Siit",
        done: "Listed applications on Siit",
      },
      get_application: {
        running: "Fetching application from Siit",
        done: "Fetched application from Siit",
      },
      create_application: {
        running: "Creating application on Siit",
        done: "Created application on Siit",
      },
      update_application: {
        running: "Updating application on Siit",
        done: "Updated application on Siit",
      },
      archive_application: {
        running: "Archiving application on Siit",
        done: "Archived application on Siit",
      },
      unarchive_application: {
        running: "Unarchiving application on Siit",
        done: "Unarchived application on Siit",
      },
      list_equipments: {
        running: "Listing equipment on Siit",
        done: "Listed equipment on Siit",
      },
      get_equipment: {
        running: "Fetching equipment from Siit",
        done: "Fetched equipment from Siit",
      },
      create_equipment: {
        running: "Creating equipment on Siit",
        done: "Created equipment on Siit",
      },
      update_equipment: {
        running: "Updating equipment on Siit",
        done: "Updated equipment on Siit",
      },
      archive_equipment: {
        running: "Archiving equipment on Siit",
        done: "Archived equipment on Siit",
      },
      unarchive_equipment: {
        running: "Unarchiving equipment on Siit",
        done: "Unarchived equipment on Siit",
      },
      list_equipment_categories: {
        running: "Listing equipment categories on Siit",
        done: "Listed equipment categories on Siit",
      },
      list_departments: {
        running: "Listing departments on Siit",
        done: "Listed departments on Siit",
      },
      get_department: {
        running: "Fetching department from Siit",
        done: "Fetched department from Siit",
      },
      list_legal_entities: {
        running: "Listing legal entities on Siit",
        done: "Listed legal entities on Siit",
      },
      get_legal_entity: {
        running: "Fetching legal entity from Siit",
        done: "Fetched legal entity from Siit",
      },
      list_office_locations: {
        running: "Listing office locations on Siit",
        done: "Listed office locations on Siit",
      },
      get_office_location: {
        running: "Fetching office location from Siit",
        done: "Fetched office location from Siit",
      },
      list_teams: {
        running: "Listing teams on Siit",
        done: "Listed teams on Siit",
      },
      get_team: {
        running: "Fetching team from Siit",
        done: "Fetched team from Siit",
      },
      list_article_categories: {
        running: "Listing article categories on Siit",
        done: "Listed article categories on Siit",
      },
      list_articles: {
        running: "Listing articles on Siit",
        done: "Listed articles on Siit",
      },
      get_article: {
        running: "Fetching article from Siit",
        done: "Fetched article from Siit",
      },
      create_article: {
        running: "Creating article on Siit",
        done: "Created article on Siit",
      },
      update_article: {
        running: "Updating article on Siit",
        done: "Updated article on Siit",
      },
      publish_article: {
        running: "Publishing article on Siit",
        done: "Published article on Siit",
      },
      unpublish_article: {
        running: "Unpublishing article on Siit",
        done: "Unpublished article on Siit",
      },
      archive_article: {
        running: "Archiving article on Siit",
        done: "Archived article on Siit",
      },
      unarchive_article: {
        running: "Unarchiving article on Siit",
        done: "Unarchived article on Siit",
      },
      list_workflows: {
        running: "Listing workflows on Siit",
        done: "Listed workflows on Siit",
      },
      get_workflow: {
        running: "Fetching workflow from Siit",
        done: "Fetched workflow from Siit",
      },
      get_workflow_execution_logs: {
        running: "Fetching workflow execution logs from Siit",
        done: "Fetched workflow execution logs from Siit",
      },
      get_workflow_manifest_schema: {
        running: "Fetching workflow manifest schema from Siit",
        done: "Fetched workflow manifest schema from Siit",
      },
      create_workflow: {
        running: "Creating workflow on Siit",
        done: "Created workflow on Siit",
      },
      update_workflow: {
        running: "Updating workflow on Siit",
        done: "Updated workflow on Siit",
      },
      fetch_attachment: {
        running: "Fetching attachment from Siit",
        done: "Fetched attachment from Siit",
      },
    },
  },
  {
    id: 10034,
    name: "Qobra",
    description:
      "Qobra tools to read your sales compensation data — commission plans, quotas, statements, payouts, reports, and dashboards, scoped to your Qobra permissions (Region: EU).",
    url: "https://mcp.qobra.co/mcp",
    icon: "QobraLogo",
    documentationUrl: "https://docs.qobra.co/mcp_documentation/introduction",
    connectionInstructions:
      "Qobra uses OAuth with dynamic client registration. You will be prompted to sign in with your Qobra account. Access is read-only and scoped to your Qobra role permissions. The MCP server must be enabled for your company by one of your own Qobra admins. If the sign-in screen says the feature isn't available for your account, ask your Qobra admin to turn it on from Your account > Settings > AI > MCP.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      get_identity: "never_ask",
      get_company_settings: "never_ask",
      list_sandboxes: "never_ask",
      list_data_tables: "never_ask",
      get_data_table: "never_ask",
      list_data_table_records: "never_ask",
      list_integrations: "never_ask",
      list_users: "never_ask",
      get_user: "never_ask",
      list_user_attributes: "never_ask",
      list_roles: "never_ask",
      get_role: "never_ask",
      list_groups: "never_ask",
      get_group: "never_ask",
      list_group_dimensions: "never_ask",
      list_quotas: "never_ask",
      list_quota_values: "never_ask",
      list_plans: "never_ask",
      get_plan: "never_ask",
      list_commission_letters_campaigns: "never_ask",
      get_commission_letters_campaign: "never_ask",
      list_reports: "never_ask",
      get_report: "never_ask",
      get_report_data: "never_ask",
      get_report_pivot_data: "never_ask",
      get_report_chart_data: "never_ask",
      list_dashboards: "never_ask",
      get_dashboard: "never_ask",
      list_requests: "never_ask",
      get_request: "never_ask",
      list_sales_coach_discussions: "never_ask",
      get_sales_coach_discussion: "never_ask",
      list_statements: "never_ask",
      get_statement: "never_ask",
      get_statement_compensation: "never_ask",
      list_statement_records: "never_ask",
      list_statement_periods: "never_ask",
      list_exchange_rates: "never_ask",
      list_imports: "never_ask",
      get_import: "never_ask",
      list_audit_logs: "never_ask",
      get_audit_log: "never_ask",
      list_dependencies: "never_ask",
      list_help_center_articles: "never_ask",
      get_help_center_article: "never_ask",
    },
    // Les labels sont résolus par slugify(name), donc "qobra" et "qobra-us"
    // sont deux espaces de noms distincts : la copie est nécessaire.
    toolDisplayLabels: {
      get_identity: {
        running: "Fetching your Qobra identity",
        done: "Fetched your Qobra identity",
      },
      get_company_settings: {
        running: "Fetching company settings from Qobra",
        done: "Fetched company settings from Qobra",
      },
      list_sandboxes: {
        running: "Listing sandboxes on Qobra",
        done: "Listed sandboxes on Qobra",
      },
      list_data_tables: {
        running: "Listing data tables on Qobra",
        done: "Listed data tables on Qobra",
      },
      get_data_table: {
        running: "Fetching data table from Qobra",
        done: "Fetched data table from Qobra",
      },
      list_data_table_records: {
        running: "Listing data table records on Qobra",
        done: "Listed data table records on Qobra",
      },
      list_integrations: {
        running: "Listing integrations on Qobra",
        done: "Listed integrations on Qobra",
      },
      list_users: {
        running: "Listing users on Qobra",
        done: "Listed users on Qobra",
      },
      get_user: {
        running: "Fetching user from Qobra",
        done: "Fetched user from Qobra",
      },
      list_user_attributes: {
        running: "Listing user attributes on Qobra",
        done: "Listed user attributes on Qobra",
      },
      list_roles: {
        running: "Listing roles on Qobra",
        done: "Listed roles on Qobra",
      },
      get_role: {
        running: "Fetching role from Qobra",
        done: "Fetched role from Qobra",
      },
      list_groups: {
        running: "Listing groups on Qobra",
        done: "Listed groups on Qobra",
      },
      get_group: {
        running: "Fetching group from Qobra",
        done: "Fetched group from Qobra",
      },
      list_group_dimensions: {
        running: "Listing group dimensions on Qobra",
        done: "Listed group dimensions on Qobra",
      },
      list_quotas: {
        running: "Listing quotas on Qobra",
        done: "Listed quotas on Qobra",
      },
      list_quota_values: {
        running: "Listing quota values on Qobra",
        done: "Listed quota values on Qobra",
      },
      list_plans: {
        running: "Listing compensation plans on Qobra",
        done: "Listed compensation plans on Qobra",
      },
      get_plan: {
        running: "Fetching compensation plan from Qobra",
        done: "Fetched compensation plan from Qobra",
      },
      list_commission_letters_campaigns: {
        running: "Listing commission letter campaigns on Qobra",
        done: "Listed commission letter campaigns on Qobra",
      },
      get_commission_letters_campaign: {
        running: "Fetching commission letter campaign from Qobra",
        done: "Fetched commission letter campaign from Qobra",
      },
      list_reports: {
        running: "Listing reports on Qobra",
        done: "Listed reports on Qobra",
      },
      get_report: {
        running: "Fetching report from Qobra",
        done: "Fetched report from Qobra",
      },
      get_report_data: {
        running: "Fetching report data from Qobra",
        done: "Fetched report data from Qobra",
      },
      get_report_pivot_data: {
        running: "Fetching report pivot data from Qobra",
        done: "Fetched report pivot data from Qobra",
      },
      get_report_chart_data: {
        running: "Fetching report chart data from Qobra",
        done: "Fetched report chart data from Qobra",
      },
      list_dashboards: {
        running: "Listing dashboards on Qobra",
        done: "Listed dashboards on Qobra",
      },
      get_dashboard: {
        running: "Fetching dashboard from Qobra",
        done: "Fetched dashboard from Qobra",
      },
      list_requests: {
        running: "Listing requests on Qobra",
        done: "Listed requests on Qobra",
      },
      get_request: {
        running: "Fetching request from Qobra",
        done: "Fetched request from Qobra",
      },
      list_sales_coach_discussions: {
        running: "Listing Sales Coach discussions on Qobra",
        done: "Listed Sales Coach discussions on Qobra",
      },
      get_sales_coach_discussion: {
        running: "Fetching Sales Coach discussion from Qobra",
        done: "Fetched Sales Coach discussion from Qobra",
      },
      list_statements: {
        running: "Listing statements on Qobra",
        done: "Listed statements on Qobra",
      },
      get_statement: {
        running: "Fetching statement from Qobra",
        done: "Fetched statement from Qobra",
      },
      get_statement_compensation: {
        running: "Fetching statement compensation from Qobra",
        done: "Fetched statement compensation from Qobra",
      },
      list_statement_records: {
        running: "Listing statement records on Qobra",
        done: "Listed statement records on Qobra",
      },
      list_statement_periods: {
        running: "Listing statement periods on Qobra",
        done: "Listed statement periods on Qobra",
      },
      list_exchange_rates: {
        running: "Listing exchange rates on Qobra",
        done: "Listed exchange rates on Qobra",
      },
      list_imports: {
        running: "Listing imports on Qobra",
        done: "Listed imports on Qobra",
      },
      get_import: {
        running: "Fetching import from Qobra",
        done: "Fetched import from Qobra",
      },
      list_audit_logs: {
        running: "Listing audit logs on Qobra",
        done: "Listed audit logs on Qobra",
      },
      get_audit_log: {
        running: "Fetching audit log from Qobra",
        done: "Fetched audit log from Qobra",
      },
      list_dependencies: {
        running: "Listing dependencies on Qobra",
        done: "Listed dependencies on Qobra",
      },
      list_help_center_articles: {
        running: "Listing Help Center articles on Qobra",
        done: "Listed Help Center articles on Qobra",
      },
      get_help_center_article: {
        running: "Fetching Help Center article from Qobra",
        done: "Fetched Help Center article from Qobra",
      },
    },
  },
  {
    id: 10035,
    name: "Qobra US",
    description:
      "Qobra tools to read your sales compensation data — commission plans, quotas, statements, payouts, reports, and dashboards, scoped to your Qobra permissions (Region: US).",
    url: "https://mcp-us.qobra.co/mcp",
    icon: "QobraLogo",
    documentationUrl: "https://docs.qobra.co/mcp_documentation/introduction",
    connectionInstructions:
      "Qobra uses OAuth with dynamic client registration. You will be prompted to sign in with your Qobra account. Access is read-only and scoped to your Qobra role permissions. The MCP server must be enabled for your company by one of your own Qobra admins. If the sign-in screen says the feature isn't available for your account, ask your Qobra admin to turn it on from Your account > Settings > AI > MCP.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      get_identity: "never_ask",
      get_company_settings: "never_ask",
      list_sandboxes: "never_ask",
      list_data_tables: "never_ask",
      get_data_table: "never_ask",
      list_data_table_records: "never_ask",
      list_integrations: "never_ask",
      list_users: "never_ask",
      get_user: "never_ask",
      list_user_attributes: "never_ask",
      list_roles: "never_ask",
      get_role: "never_ask",
      list_groups: "never_ask",
      get_group: "never_ask",
      list_group_dimensions: "never_ask",
      list_quotas: "never_ask",
      list_quota_values: "never_ask",
      list_plans: "never_ask",
      get_plan: "never_ask",
      list_commission_letters_campaigns: "never_ask",
      get_commission_letters_campaign: "never_ask",
      list_reports: "never_ask",
      get_report: "never_ask",
      get_report_data: "never_ask",
      get_report_pivot_data: "never_ask",
      get_report_chart_data: "never_ask",
      list_dashboards: "never_ask",
      get_dashboard: "never_ask",
      list_requests: "never_ask",
      get_request: "never_ask",
      list_sales_coach_discussions: "never_ask",
      get_sales_coach_discussion: "never_ask",
      list_statements: "never_ask",
      get_statement: "never_ask",
      get_statement_compensation: "never_ask",
      list_statement_records: "never_ask",
      list_statement_periods: "never_ask",
      list_exchange_rates: "never_ask",
      list_imports: "never_ask",
      get_import: "never_ask",
      list_audit_logs: "never_ask",
      get_audit_log: "never_ask",
      list_dependencies: "never_ask",
      list_help_center_articles: "never_ask",
      get_help_center_article: "never_ask",
    },
    // Les labels sont résolus par slugify(name), donc "qobra" et "qobra-us"
    // sont deux espaces de noms distincts : la copie est nécessaire.
    toolDisplayLabels: {
      get_identity: {
        running: "Fetching your Qobra identity",
        done: "Fetched your Qobra identity",
      },
      get_company_settings: {
        running: "Fetching company settings from Qobra",
        done: "Fetched company settings from Qobra",
      },
      list_sandboxes: {
        running: "Listing sandboxes on Qobra",
        done: "Listed sandboxes on Qobra",
      },
      list_data_tables: {
        running: "Listing data tables on Qobra",
        done: "Listed data tables on Qobra",
      },
      get_data_table: {
        running: "Fetching data table from Qobra",
        done: "Fetched data table from Qobra",
      },
      list_data_table_records: {
        running: "Listing data table records on Qobra",
        done: "Listed data table records on Qobra",
      },
      list_integrations: {
        running: "Listing integrations on Qobra",
        done: "Listed integrations on Qobra",
      },
      list_users: {
        running: "Listing users on Qobra",
        done: "Listed users on Qobra",
      },
      get_user: {
        running: "Fetching user from Qobra",
        done: "Fetched user from Qobra",
      },
      list_user_attributes: {
        running: "Listing user attributes on Qobra",
        done: "Listed user attributes on Qobra",
      },
      list_roles: {
        running: "Listing roles on Qobra",
        done: "Listed roles on Qobra",
      },
      get_role: {
        running: "Fetching role from Qobra",
        done: "Fetched role from Qobra",
      },
      list_groups: {
        running: "Listing groups on Qobra",
        done: "Listed groups on Qobra",
      },
      get_group: {
        running: "Fetching group from Qobra",
        done: "Fetched group from Qobra",
      },
      list_group_dimensions: {
        running: "Listing group dimensions on Qobra",
        done: "Listed group dimensions on Qobra",
      },
      list_quotas: {
        running: "Listing quotas on Qobra",
        done: "Listed quotas on Qobra",
      },
      list_quota_values: {
        running: "Listing quota values on Qobra",
        done: "Listed quota values on Qobra",
      },
      list_plans: {
        running: "Listing compensation plans on Qobra",
        done: "Listed compensation plans on Qobra",
      },
      get_plan: {
        running: "Fetching compensation plan from Qobra",
        done: "Fetched compensation plan from Qobra",
      },
      list_commission_letters_campaigns: {
        running: "Listing commission letter campaigns on Qobra",
        done: "Listed commission letter campaigns on Qobra",
      },
      get_commission_letters_campaign: {
        running: "Fetching commission letter campaign from Qobra",
        done: "Fetched commission letter campaign from Qobra",
      },
      list_reports: {
        running: "Listing reports on Qobra",
        done: "Listed reports on Qobra",
      },
      get_report: {
        running: "Fetching report from Qobra",
        done: "Fetched report from Qobra",
      },
      get_report_data: {
        running: "Fetching report data from Qobra",
        done: "Fetched report data from Qobra",
      },
      get_report_pivot_data: {
        running: "Fetching report pivot data from Qobra",
        done: "Fetched report pivot data from Qobra",
      },
      get_report_chart_data: {
        running: "Fetching report chart data from Qobra",
        done: "Fetched report chart data from Qobra",
      },
      list_dashboards: {
        running: "Listing dashboards on Qobra",
        done: "Listed dashboards on Qobra",
      },
      get_dashboard: {
        running: "Fetching dashboard from Qobra",
        done: "Fetched dashboard from Qobra",
      },
      list_requests: {
        running: "Listing requests on Qobra",
        done: "Listed requests on Qobra",
      },
      get_request: {
        running: "Fetching request from Qobra",
        done: "Fetched request from Qobra",
      },
      list_sales_coach_discussions: {
        running: "Listing Sales Coach discussions on Qobra",
        done: "Listed Sales Coach discussions on Qobra",
      },
      get_sales_coach_discussion: {
        running: "Fetching Sales Coach discussion from Qobra",
        done: "Fetched Sales Coach discussion from Qobra",
      },
      list_statements: {
        running: "Listing statements on Qobra",
        done: "Listed statements on Qobra",
      },
      get_statement: {
        running: "Fetching statement from Qobra",
        done: "Fetched statement from Qobra",
      },
      get_statement_compensation: {
        running: "Fetching statement compensation from Qobra",
        done: "Fetched statement compensation from Qobra",
      },
      list_statement_records: {
        running: "Listing statement records on Qobra",
        done: "Listed statement records on Qobra",
      },
      list_statement_periods: {
        running: "Listing statement periods on Qobra",
        done: "Listed statement periods on Qobra",
      },
      list_exchange_rates: {
        running: "Listing exchange rates on Qobra",
        done: "Listed exchange rates on Qobra",
      },
      list_imports: {
        running: "Listing imports on Qobra",
        done: "Listed imports on Qobra",
      },
      get_import: {
        running: "Fetching import from Qobra",
        done: "Fetched import from Qobra",
      },
      list_audit_logs: {
        running: "Listing audit logs on Qobra",
        done: "Listed audit logs on Qobra",
      },
      get_audit_log: {
        running: "Fetching audit log from Qobra",
        done: "Fetched audit log from Qobra",
      },
      list_dependencies: {
        running: "Listing dependencies on Qobra",
        done: "Listed dependencies on Qobra",
      },
      list_help_center_articles: {
        running: "Listing Help Center articles on Qobra",
        done: "Listed Help Center articles on Qobra",
      },
      get_help_center_article: {
        running: "Fetching Help Center article from Qobra",
        done: "Fetched Help Center article from Qobra",
      },
    },
  },
  {
    id: 10037,
    name: "Lokalise",
    description:
      "Lokalise tools to manage your localization projects — projects, languages, contributors, tasks, keys, glossary terms, translation orders and file uploads, scoped to your Lokalise permissions.",
    url: "https://mcp.lokalise.com/mcp/project-management",
    icon: "LokaliseLogo",
    documentationUrl:
      "https://docs.lokalise.com/en/articles/13547066-setting-up-and-using-the-lokalise-mcp-server",
    connectionInstructions:
      "Lokalise uses OAuth with dynamic client registration. You will be prompted to sign in with your Lokalise account and to grant the scopes the tools need. The MCP can only read data you can already see and only perform writes you can already perform in Lokalise, so your contributor role must give you access to the projects you want to work on. This is the project management toolkit; developers looking for keys, screenshots and file downloads should use the Lokalise Software Development server instead.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      list_lokalise_projects: "never_ask",
      get_lokalise_project: "never_ask",
      get_project_statistics: "never_ask",
      list_project_languages: "never_ask",
      list_project_contributors: "never_ask",
      list_lokalise_tasks: "never_ask",
      get_lokalise_task: "never_ask",
      list_lokalise_teams: "never_ask",
      get_lokalise_team: "never_ask",
      list_lokalise_team_users: "never_ask",
      list_lokalise_translation_orders: "never_ask",
      get_lokalise_translation_order: "never_ask",
      list_lokalise_keys: "never_ask",
      get_lokalise_key: "never_ask",
      list_lokalise_glossary_terms: "never_ask",
      get_lokalise_glossary_term: "never_ask",
      get_file_upload_url: "never_ask",
      get_process_status: "never_ask",
      list_processes: "never_ask",

      update_lokalise_task: "low",
      create_lokalise_keys: "low",
      update_lokalise_key: "low",
      create_lokalise_glossary_terms: "low",
      update_lokalise_glossary_terms: "low",

      // Structural, hard to undo, or spends money: always ask.
      // task_type "automatic_translation" burns paid Lokalise AI words or
      // Google/DeepL machine translation credits.
      create_lokalise_task: "high",
      create_project: "high",
      create_project_contributor: "high",
      add_project_language: "high",
      // Places a paid order with translation providers.
      create_lokalise_translation_order: "high",
      // Both rewrite existing translations in bulk.
      bulk_update_lokalise_keys: "high",
      upload_file: "high",
    },
    toolDisplayLabels: {
      list_lokalise_projects: {
        running: "Listing projects on Lokalise",
        done: "Listed projects on Lokalise",
      },
      get_lokalise_project: {
        running: "Fetching project from Lokalise",
        done: "Fetched project from Lokalise",
      },
      get_project_statistics: {
        running: "Fetching project statistics from Lokalise",
        done: "Fetched project statistics from Lokalise",
      },
      list_project_languages: {
        running: "Listing project languages on Lokalise",
        done: "Listed project languages on Lokalise",
      },
      create_project: {
        running: "Creating project on Lokalise",
        done: "Created project on Lokalise",
      },
      list_project_contributors: {
        running: "Listing project contributors on Lokalise",
        done: "Listed project contributors on Lokalise",
      },
      create_project_contributor: {
        running: "Adding contributor on Lokalise",
        done: "Added contributor on Lokalise",
      },
      add_project_language: {
        running: "Adding language to project on Lokalise",
        done: "Added language to project on Lokalise",
      },
      list_lokalise_tasks: {
        running: "Listing tasks on Lokalise",
        done: "Listed tasks on Lokalise",
      },
      get_lokalise_task: {
        running: "Fetching task from Lokalise",
        done: "Fetched task from Lokalise",
      },
      create_lokalise_task: {
        running: "Creating task on Lokalise",
        done: "Created task on Lokalise",
      },
      update_lokalise_task: {
        running: "Updating task on Lokalise",
        done: "Updated task on Lokalise",
      },
      list_lokalise_teams: {
        running: "Listing teams on Lokalise",
        done: "Listed teams on Lokalise",
      },
      get_lokalise_team: {
        running: "Fetching team from Lokalise",
        done: "Fetched team from Lokalise",
      },
      list_lokalise_team_users: {
        running: "Listing team users on Lokalise",
        done: "Listed team users on Lokalise",
      },
      list_lokalise_translation_orders: {
        running: "Listing translation orders on Lokalise",
        done: "Listed translation orders on Lokalise",
      },
      get_lokalise_translation_order: {
        running: "Fetching translation order from Lokalise",
        done: "Fetched translation order from Lokalise",
      },
      create_lokalise_translation_order: {
        running: "Placing translation order on Lokalise",
        done: "Placed translation order on Lokalise",
      },
      list_lokalise_keys: {
        running: "Listing keys on Lokalise",
        done: "Listed keys on Lokalise",
      },
      get_lokalise_key: {
        running: "Fetching key from Lokalise",
        done: "Fetched key from Lokalise",
      },
      create_lokalise_keys: {
        running: "Creating keys on Lokalise",
        done: "Created keys on Lokalise",
      },
      update_lokalise_key: {
        running: "Updating key on Lokalise",
        done: "Updated key on Lokalise",
      },
      bulk_update_lokalise_keys: {
        running: "Bulk updating keys on Lokalise",
        done: "Bulk updated keys on Lokalise",
      },
      list_lokalise_glossary_terms: {
        running: "Listing glossary terms on Lokalise",
        done: "Listed glossary terms on Lokalise",
      },
      get_lokalise_glossary_term: {
        running: "Fetching glossary term from Lokalise",
        done: "Fetched glossary term from Lokalise",
      },
      create_lokalise_glossary_terms: {
        running: "Creating glossary terms on Lokalise",
        done: "Created glossary terms on Lokalise",
      },
      update_lokalise_glossary_terms: {
        running: "Updating glossary terms on Lokalise",
        done: "Updated glossary terms on Lokalise",
      },
      get_file_upload_url: {
        running: "Preparing file upload on Lokalise",
        done: "Prepared file upload on Lokalise",
      },
      upload_file: {
        running: "Uploading file to Lokalise",
        done: "Uploaded file to Lokalise",
      },
      get_process_status: {
        running: "Checking process status on Lokalise",
        done: "Checked process status on Lokalise",
      },
      list_processes: {
        running: "Listing processes on Lokalise",
        done: "Listed processes on Lokalise",
      },
    },
  },
  {
    id: 10038,
    name: "Lokalise Software Development",
    description:
      "Lokalise tools for developer localization workflows — projects, translation keys, screenshots, tasks and file downloads, scoped to your Lokalise permissions.",
    url: "https://mcp.lokalise.com/mcp/software-development",
    icon: "LokaliseLogo",
    documentationUrl:
      "https://docs.lokalise.com/en/articles/13547066-setting-up-and-using-the-lokalise-mcp-server",
    connectionInstructions:
      "Lokalise uses OAuth with dynamic client registration. You will be prompted to sign in with your Lokalise account and to grant the scopes the tools need. The MCP can only read data you can already see and only perform writes you can already perform in Lokalise, so your contributor role must give you access to the projects you want to work on. This is the software development toolkit; for contributors, teams, glossary and translation orders, use the Lokalise server instead.",
    authMethod: "oauth-dynamic",
    // Ce serveur partage des noms d'outils avec "Lokalise", mais les stakes et
    // les labels sont résolus par serveur : la copie est nécessaire.
    toolStakes: {
      list_lokalise_tasks: "never_ask",
      get_lokalise_task: "never_ask",
      list_lokalise_projects: "never_ask",
      get_lokalise_project: "never_ask",
      list_lokalise_keys: "never_ask",
      get_lokalise_key: "never_ask",
      list_lokalise_screenshots: "never_ask",
      get_lokalise_screenshot: "never_ask",
      download_files: "never_ask",
      download_files_async: "never_ask",
      get_process_status: "never_ask",

      create_lokalise_keys: "low",
      update_lokalise_key: "low",
      create_lokalise_screenshots: "low",
      update_lokalise_screenshot: "low",

      // task_type "automatic_translation" burns paid Lokalise AI words or
      // Google/DeepL machine translation credits.
      create_lokalise_task: "high",
      // Rewrites existing translations in bulk.
      bulk_update_lokalise_keys: "high",
      delete_lokalise_screenshot: "high",
    },
    toolDisplayLabels: {
      list_lokalise_tasks: {
        running: "Listing tasks on Lokalise",
        done: "Listed tasks on Lokalise",
      },
      get_lokalise_task: {
        running: "Fetching task from Lokalise",
        done: "Fetched task from Lokalise",
      },
      create_lokalise_task: {
        running: "Creating task on Lokalise",
        done: "Created task on Lokalise",
      },
      list_lokalise_projects: {
        running: "Listing projects on Lokalise",
        done: "Listed projects on Lokalise",
      },
      get_lokalise_project: {
        running: "Fetching project from Lokalise",
        done: "Fetched project from Lokalise",
      },
      list_lokalise_keys: {
        running: "Listing keys on Lokalise",
        done: "Listed keys on Lokalise",
      },
      get_lokalise_key: {
        running: "Fetching key from Lokalise",
        done: "Fetched key from Lokalise",
      },
      create_lokalise_keys: {
        running: "Creating keys on Lokalise",
        done: "Created keys on Lokalise",
      },
      update_lokalise_key: {
        running: "Updating key on Lokalise",
        done: "Updated key on Lokalise",
      },
      bulk_update_lokalise_keys: {
        running: "Bulk updating keys on Lokalise",
        done: "Bulk updated keys on Lokalise",
      },
      list_lokalise_screenshots: {
        running: "Listing screenshots on Lokalise",
        done: "Listed screenshots on Lokalise",
      },
      get_lokalise_screenshot: {
        running: "Fetching screenshot from Lokalise",
        done: "Fetched screenshot from Lokalise",
      },
      create_lokalise_screenshots: {
        running: "Adding screenshots to Lokalise",
        done: "Added screenshots to Lokalise",
      },
      update_lokalise_screenshot: {
        running: "Updating screenshot on Lokalise",
        done: "Updated screenshot on Lokalise",
      },
      delete_lokalise_screenshot: {
        running: "Deleting screenshot on Lokalise",
        done: "Deleted screenshot on Lokalise",
      },
      download_files: {
        running: "Downloading files from Lokalise",
        done: "Downloaded files from Lokalise",
      },
      download_files_async: {
        running: "Downloading files from Lokalise",
        done: "Downloaded files from Lokalise",
      },
      get_process_status: {
        running: "Checking process status on Lokalise",
        done: "Checked process status on Lokalise",
      },
    },
  },
];

export const getDefaultRemoteMCPServerByURL = (
  url: string | null | undefined
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
