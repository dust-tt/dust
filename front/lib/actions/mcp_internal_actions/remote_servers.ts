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
        running: "Searching tasks on Asana",
        done: "Search tasks on Asana",
      },
      asana_get_task: {
        running: "Retrieving task on Asana",
        done: "Retrieve task on Asana",
      },
      asana_create_task: {
        running: "Creating task on Asana",
        done: "Create task on Asana",
      },
      asana_update_task: {
        running: "Updating task on Asana",
        done: "Update task on Asana",
      },
      asana_delete_task: {
        running: "Deleting task on Asana",
        done: "Delete task on Asana",
      },
      asana_get_project: {
        running: "Retrieving project on Asana",
        done: "Retrieve project on Asana",
      },
      asana_get_projects: {
        running: "Listing projects on Asana",
        done: "List projects on Asana",
      },
      asana_create_project: {
        running: "Creating project on Asana",
        done: "Create project on Asana",
      },
      asana_get_goals: {
        running: "Listing goals on Asana",
        done: "List goals on Asana",
      },
      asana_get_goal: {
        running: "Retrieving goal on Asana",
        done: "Retrieve goal on Asana",
      },
      asana_create_goal: {
        running: "Creating goal on Asana",
        done: "Create goal on Asana",
      },
      asana_update_goal: {
        running: "Updating goal on Asana",
        done: "Update goal on Asana",
      },
      asana_get_stories_for_task: {
        running: "Retrieving task stories on Asana",
        done: "Retrieve task stories on Asana",
      },
      asana_create_task_story: {
        running: "Creating task story on Asana",
        done: "Create task story on Asana",
      },
      asana_get_attachment: {
        running: "Retrieving attachment on Asana",
        done: "Retrieve attachment on Asana",
      },
      asana_get_attachments_for_object: {
        running: "Retrieving attachments on Asana",
        done: "Retrieve attachments on Asana",
      },
      asana_get_parent_goals_for_goal: {
        running: "Retrieving parent goals on Asana",
        done: "Retrieve parent goals on Asana",
      },
      asana_get_portfolio: {
        running: "Retrieving portfolio on Asana",
        done: "Retrieve portfolio on Asana",
      },
      asana_get_portfolios: {
        running: "Listing portfolios on Asana",
        done: "List portfolios on Asana",
      },
      asana_get_items_for_portfolio: {
        running: "Retrieving portfolio items on Asana",
        done: "Retrieve portfolio items on Asana",
      },
      asana_get_project_sections: {
        running: "Retrieving project sections on Asana",
        done: "Retrieve project sections on Asana",
      },
      asana_get_project_status: {
        running: "Retrieving project status on Asana",
        done: "Retrieve project status on Asana",
      },
      asana_get_project_statuses: {
        running: "Listing project statuses on Asana",
        done: "List project statuses on Asana",
      },
      asana_create_project_status: {
        running: "Creating project status on Asana",
        done: "Create project status on Asana",
      },
      asana_get_project_task_counts: {
        running: "Retrieving task counts on Asana",
        done: "Retrieve task counts on Asana",
      },
      asana_get_projects_for_team: {
        running: "Listing team projects on Asana",
        done: "List team projects on Asana",
      },
      asana_get_projects_for_workspace: {
        running: "Listing workspace projects on Asana",
        done: "List workspace projects on Asana",
      },
      asana_set_task_dependencies: {
        running: "Setting task dependencies on Asana",
        done: "Set task dependencies on Asana",
      },
      asana_set_task_dependents: {
        running: "Setting task dependents on Asana",
        done: "Set task dependents on Asana",
      },
      asana_set_parent_for_task: {
        running: "Setting task parent on Asana",
        done: "Set task parent on Asana",
      },
      asana_get_tasks: {
        running: "Listing tasks on Asana",
        done: "List tasks on Asana",
      },
      asana_add_task_followers: {
        running: "Adding task followers on Asana",
        done: "Add task followers on Asana",
      },
      asana_remove_task_followers: {
        running: "Removing task followers on Asana",
        done: "Remove task followers on Asana",
      },
      asana_get_teams_for_workspace: {
        running: "Listing workspace teams on Asana",
        done: "List workspace teams on Asana",
      },
      asana_get_teams_for_user: {
        running: "Listing user teams on Asana",
        done: "List user teams on Asana",
      },
      asana_get_time_period: {
        running: "Retrieving time period on Asana",
        done: "Retrieve time period on Asana",
      },
      asana_get_time_periods: {
        running: "Listing time periods on Asana",
        done: "List time periods on Asana",
      },
      asana_typeahead_search: {
        running: "Searching on Asana (typeahead)",
        done: "Search on Asana (typeahead)",
      },
      asana_get_user: {
        running: "Retrieving user on Asana",
        done: "Retrieve user on Asana",
      },
      asana_get_team_users: {
        running: "Listing team users on Asana",
        done: "List team users on Asana",
      },
      asana_get_workspace_users: {
        running: "Listing workspace users on Asana",
        done: "List workspace users on Asana",
      },
      asana_list_workspaces: {
        running: "Listing workspaces on Asana",
        done: "List workspaces on Asana",
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
    id: 10010,
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
