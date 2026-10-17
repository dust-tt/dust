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
  // Overrides the `client_uri` sent at Dynamic Client Registration, for servers that allowlist
  // a fixed value.
  dcrClientUri?: string;
  hostDerivedOAuth?: HostDerivedOAuthConfig;
  toolStakes?: Record<string, "high" | "low" | "medium" | "never_ask">;
  toolDisplayLabels?: Record<string, ToolDisplayLabels>;
  // Required to see the preset; on a `creditBasedPlansOnly` preset it instead lets a
  // workspace in regardless of its plan.
  featureFlag?: WhitelistableFeature;
  // Only offered to workspaces on a credit-based plan (`isCreditBasedPlan`).
  creditBasedPlansOnly?: boolean;
};

const AMPLITUDE_SHARED_CONFIG: Omit<
  DefaultRemoteMCPServerConfig,
  "id" | "name" | "description" | "url"
> = {
  icon: "AmplitudeLogo",
  documentationUrl: "https://amplitude.com/docs/amplitude-ai/amplitude-mcp",
  connectionInstructions:
    "Amplitude uses OAuth. You will be prompted to sign in with your Amplitude account. Access is scoped to the projects you already have permission to view. Admins can disable MCP access org-wide via Settings > Content Access > MCP.",
  authMethod: "oauth-dynamic",
  toolStakes: {
    search: "never_ask",
    get_from_url: "never_ask",
    get_amplitude_context: "never_ask",
    query_amplitude_data: "never_ask",
    get_amplitude_charts: "never_ask",
    render_amplitude_chart: "never_ask",
    get_amp_user_data: "never_ask",
    get_experiments: "never_ask",
    query_experiment: "never_ask",
    get_flags: "never_ask",
    get_deployments: "never_ask",
    get_amp_taxonomy: "never_ask",
    get_transformations: "never_ask",
    get_group_types: "never_ask",
    get_session_replays: "never_ask",
    list_session_replays: "never_ask",
    get_session_replay_events: "never_ask",
    list_guides_surveys: "never_ask",
    get_guide_or_survey: "never_ask",
    query_wave_opportunities: "never_ask",
    query_wave_product_areas: "never_ask",
    use_amplitude_ai_feedback: "never_ask",
    get_agent_results: "never_ask",
    get_amplitude_agent_analytics_info: "never_ask",
    get_data_ingestion_sources: "never_ask",
    get_data_source_details: "never_ask",
    get_data_warehouse_destinations: "never_ask",
    get_data_warehouse_jobs: "never_ask",
    list_tool_categories: "never_ask",
    get_category_tools: "never_ask",
    describe_tool: "never_ask",
    use_amplitude_chart_monitors: "low",
    use_amp_dashboards: "low",
    use_amp_notebooks: "low",
    use_amp_comments: "low",
    use_amplitude_cohorts: "low",
    create_experiment: "low",
    update_experiment: "low",
    create_metric: "low",
    manage_wave_opportunities: "low",
    manage_wave_product_areas: "low",
    manage_wave_verification_artifacts: "low",
    share_amp_entities: "high",
    create_flags: "high",
    update_flag: "high",
    manage_amp_events: "high",
    manage_amp_properties: "high",
    manage_amp_taxonomy: "high",
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
    get_amplitude_context: {
      running: "Fetching context from Amplitude",
      done: "Fetched context from Amplitude",
    },
    query_amplitude_data: {
      running: "Querying data on Amplitude",
      done: "Queried data on Amplitude",
    },
    get_amplitude_charts: {
      running: "Fetching charts from Amplitude",
      done: "Fetched charts from Amplitude",
    },
    render_amplitude_chart: {
      running: "Rendering chart from Amplitude",
      done: "Rendered chart from Amplitude",
    },
    get_amp_user_data: {
      running: "Fetching user data from Amplitude",
      done: "Fetched user data from Amplitude",
    },
    get_experiments: {
      running: "Fetching experiments from Amplitude",
      done: "Fetched experiments from Amplitude",
    },
    query_experiment: {
      running: "Querying experiment on Amplitude",
      done: "Queried experiment on Amplitude",
    },
    get_flags: {
      running: "Fetching feature flags from Amplitude",
      done: "Fetched feature flags from Amplitude",
    },
    get_deployments: {
      running: "Fetching deployments from Amplitude",
      done: "Fetched deployments from Amplitude",
    },
    get_amp_taxonomy: {
      running: "Fetching taxonomy from Amplitude",
      done: "Fetched taxonomy from Amplitude",
    },
    get_transformations: {
      running: "Fetching transformations from Amplitude",
      done: "Fetched transformations from Amplitude",
    },
    get_group_types: {
      running: "Fetching group types from Amplitude",
      done: "Fetched group types from Amplitude",
    },
    get_session_replays: {
      running: "Fetching session replays from Amplitude",
      done: "Fetched session replays from Amplitude",
    },
    list_session_replays: {
      running: "Listing session replays on Amplitude",
      done: "Listed session replays on Amplitude",
    },
    get_session_replay_events: {
      running: "Fetching session replay events from Amplitude",
      done: "Fetched session replay events from Amplitude",
    },
    list_guides_surveys: {
      running: "Listing guides and surveys on Amplitude",
      done: "Listed guides and surveys on Amplitude",
    },
    get_guide_or_survey: {
      running: "Fetching guide or survey from Amplitude",
      done: "Fetched guide or survey from Amplitude",
    },
    query_wave_opportunities: {
      running: "Querying opportunities on Amplitude",
      done: "Queried opportunities on Amplitude",
    },
    query_wave_product_areas: {
      running: "Querying product areas on Amplitude",
      done: "Queried product areas on Amplitude",
    },
    use_amplitude_ai_feedback: {
      running: "Fetching feedback from Amplitude",
      done: "Fetched feedback from Amplitude",
    },
    get_agent_results: {
      running: "Fetching agent results from Amplitude",
      done: "Fetched agent results from Amplitude",
    },
    get_amplitude_agent_analytics_info: {
      running: "Fetching agent analytics from Amplitude",
      done: "Fetched agent analytics from Amplitude",
    },
    get_data_ingestion_sources: {
      running: "Fetching ingestion sources from Amplitude",
      done: "Fetched ingestion sources from Amplitude",
    },
    get_data_source_details: {
      running: "Fetching data source details from Amplitude",
      done: "Fetched data source details from Amplitude",
    },
    get_data_warehouse_destinations: {
      running: "Fetching warehouse destinations from Amplitude",
      done: "Fetched warehouse destinations from Amplitude",
    },
    get_data_warehouse_jobs: {
      running: "Fetching warehouse jobs from Amplitude",
      done: "Fetched warehouse jobs from Amplitude",
    },
    list_tool_categories: {
      running: "Listing tool categories on Amplitude",
      done: "Listed tool categories on Amplitude",
    },
    get_category_tools: {
      running: "Listing category tools on Amplitude",
      done: "Listed category tools on Amplitude",
    },
    describe_tool: {
      running: "Describing tool on Amplitude",
      done: "Described tool on Amplitude",
    },
    use_amplitude_chart_monitors: {
      running: "Managing chart monitors on Amplitude",
      done: "Managed chart monitors on Amplitude",
    },
    use_amp_dashboards: {
      running: "Managing dashboards on Amplitude",
      done: "Managed dashboards on Amplitude",
    },
    use_amp_notebooks: {
      running: "Managing notebooks on Amplitude",
      done: "Managed notebooks on Amplitude",
    },
    use_amp_comments: {
      running: "Managing comments on Amplitude",
      done: "Managed comments on Amplitude",
    },
    use_amplitude_cohorts: {
      running: "Managing cohorts on Amplitude",
      done: "Managed cohorts on Amplitude",
    },
    create_experiment: {
      running: "Creating experiment on Amplitude",
      done: "Created experiment on Amplitude",
    },
    update_experiment: {
      running: "Updating experiment on Amplitude",
      done: "Updated experiment on Amplitude",
    },
    create_metric: {
      running: "Creating metric on Amplitude",
      done: "Created metric on Amplitude",
    },
    manage_wave_opportunities: {
      running: "Managing opportunities on Amplitude",
      done: "Managed opportunities on Amplitude",
    },
    manage_wave_product_areas: {
      running: "Managing product areas on Amplitude",
      done: "Managed product areas on Amplitude",
    },
    manage_wave_verification_artifacts: {
      running: "Managing verification artifacts on Amplitude",
      done: "Managed verification artifacts on Amplitude",
    },
    share_amp_entities: {
      running: "Updating sharing on Amplitude",
      done: "Updated sharing on Amplitude",
    },
    create_flags: {
      running: "Creating feature flags on Amplitude",
      done: "Created feature flags on Amplitude",
    },
    update_flag: {
      running: "Updating feature flag on Amplitude",
      done: "Updated feature flag on Amplitude",
    },
    manage_amp_events: {
      running: "Managing events on Amplitude",
      done: "Managed events on Amplitude",
    },
    manage_amp_properties: {
      running: "Managing properties on Amplitude",
      done: "Managed properties on Amplitude",
    },
    manage_amp_taxonomy: {
      running: "Managing tracking plan on Amplitude",
      done: "Managed tracking plan on Amplitude",
    },
  },
};

const QOBRA_SHARED_CONFIG: Omit<
  DefaultRemoteMCPServerConfig,
  "id" | "name" | "description" | "url"
> = {
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
};

const PANDADOC_SHARED_CONFIG: Omit<
  DefaultRemoteMCPServerConfig,
  "id" | "name" | "description" | "url" | "connectionInstructions"
> = {
  icon: "PandaDocLogo",
  documentationUrl:
    "https://developers.pandadoc.com/docs/getting-started-with-mcp",
  authMethod: "oauth-dynamic",
  toolStakes: {
    documents_audit_trail_get: "never_ask",
    documents_list: "never_ask",
    documents_search: "never_ask",
    documents_status_get: "never_ask",
    documents_details_get: "never_ask",
    documents_summary_get: "never_ask",
    documents_content_get: "never_ask",
    documents_metadata_batch_get: "never_ask",
    contacts_list: "never_ask",
    contacts_search: "never_ask",
    templates_list: "never_ask",
    templates_details_get: "never_ask",
    catalog_items_search: "never_ask",
    catalog_item_get: "never_ask",
    documents_create: "high",
    documents_update: "high",
    documents_status_change: "high",
    documents_send: "high",
    documents_fields_assign: "high",
    documents_archive: "high",
    documents_reminder_send: "high",
    recipients_edit: "high",
    recipients_add_cc: "high",
    recipients_reassign: "high",
    recipients_delete: "high",
    templates_create: "high",
    templates_update: "high",
    templates_duplicate: "high",
    templates_delete: "high",
    catalog_item_create: "high",
    catalog_item_update: "high",
    catalog_item_delete: "high",
    quotes_update: "high",
  },
  toolDisplayLabels: {
    documents_audit_trail_get: {
      running: "Loading a document audit trail from PandaDoc",
      done: "Loaded a document audit trail from PandaDoc",
    },
    documents_list: {
      running: "Listing documents on PandaDoc",
      done: "Listed documents on PandaDoc",
    },
    documents_search: {
      running: "Searching documents on PandaDoc",
      done: "Searched documents on PandaDoc",
    },
    documents_status_get: {
      running: "Checking a document status on PandaDoc",
      done: "Checked a document status on PandaDoc",
    },
    documents_details_get: {
      running: "Loading document details from PandaDoc",
      done: "Loaded document details from PandaDoc",
    },
    documents_summary_get: {
      running: "Loading a document summary from PandaDoc",
      done: "Loaded a document summary from PandaDoc",
    },
    documents_content_get: {
      running: "Loading document content from PandaDoc",
      done: "Loaded document content from PandaDoc",
    },
    documents_metadata_batch_get: {
      running: "Loading document metadata from PandaDoc",
      done: "Loaded document metadata from PandaDoc",
    },
    contacts_list: {
      running: "Looking up a contact by email on PandaDoc",
      done: "Looked up a contact by email on PandaDoc",
    },
    contacts_search: {
      running: "Searching contacts on PandaDoc",
      done: "Searched contacts on PandaDoc",
    },
    templates_list: {
      running: "Listing templates on PandaDoc",
      done: "Listed templates on PandaDoc",
    },
    templates_details_get: {
      running: "Loading template details from PandaDoc",
      done: "Loaded template details from PandaDoc",
    },
    catalog_items_search: {
      running: "Searching catalog items on PandaDoc",
      done: "Searched catalog items on PandaDoc",
    },
    catalog_item_get: {
      running: "Loading a catalog item from PandaDoc",
      done: "Loaded a catalog item from PandaDoc",
    },
    documents_create: {
      running: "Creating a document on PandaDoc",
      done: "Created a document on PandaDoc",
    },
    documents_update: {
      running: "Updating a document on PandaDoc",
      done: "Updated a document on PandaDoc",
    },
    documents_status_change: {
      running: "Changing a document status on PandaDoc",
      done: "Changed a document status on PandaDoc",
    },
    documents_send: {
      running: "Sending a document on PandaDoc",
      done: "Sent a document on PandaDoc",
    },
    documents_fields_assign: {
      running: "Assigning document fields on PandaDoc",
      done: "Assigned document fields on PandaDoc",
    },
    documents_archive: {
      running: "Archiving a document on PandaDoc",
      done: "Archived a document on PandaDoc",
    },
    documents_reminder_send: {
      running: "Sending a document reminder on PandaDoc",
      done: "Sent a document reminder on PandaDoc",
    },
    recipients_edit: {
      running: "Editing a recipient on PandaDoc",
      done: "Edited a recipient on PandaDoc",
    },
    recipients_add_cc: {
      running: "Adding a CC recipient on PandaDoc",
      done: "Added a CC recipient on PandaDoc",
    },
    recipients_reassign: {
      running: "Reassigning a recipient on PandaDoc",
      done: "Reassigned a recipient on PandaDoc",
    },
    recipients_delete: {
      running: "Removing a recipient on PandaDoc",
      done: "Removed a recipient on PandaDoc",
    },
    templates_create: {
      running: "Creating a template on PandaDoc",
      done: "Created a template on PandaDoc",
    },
    templates_update: {
      running: "Updating a template on PandaDoc",
      done: "Updated a template on PandaDoc",
    },
    templates_duplicate: {
      running: "Duplicating a template on PandaDoc",
      done: "Duplicated a template on PandaDoc",
    },
    templates_delete: {
      running: "Deleting a template on PandaDoc",
      done: "Deleted a template on PandaDoc",
    },
    catalog_item_create: {
      running: "Creating a catalog item on PandaDoc",
      done: "Created a catalog item on PandaDoc",
    },
    catalog_item_update: {
      running: "Updating a catalog item on PandaDoc",
      done: "Updated a catalog item on PandaDoc",
    },
    catalog_item_delete: {
      running: "Deleting a catalog item on PandaDoc",
      done: "Deleted a catalog item on PandaDoc",
    },
    quotes_update: {
      running: "Updating quotes on PandaDoc",
      done: "Updated quotes on PandaDoc",
    },
  },
};

const CONTENTFUL_SHARED_CONFIG: Omit<
  DefaultRemoteMCPServerConfig,
  "id" | "name" | "description" | "url" | "connectionInstructions"
> = {
  icon: "ContentfulLogo",
  documentationUrl:
    "https://www.contentful.com/developers/docs/tools/mcp-server/",
  authMethod: "oauth-dynamic",
  toolStakes: {
    get_initial_context: "never_ask",
    search_entries: "never_ask",
    semantic_search: "never_ask",
    get_entry: "never_ask",
    create_entry: "low",
    update_entry: "low",
    publish_entry: "high",
    unpublish_entry: "high",
    archive_entry: "low",
    unarchive_entry: "low",
    delete_entry: "high",
    get_entry_snapshot: "never_ask",
    resolve_entry_references: "never_ask",
    list_content_types: "never_ask",
    get_content_type: "never_ask",
    create_content_type: "low",
    update_content_type: "low",
    publish_content_type: "high",
    unpublish_content_type: "high",
    delete_content_type: "high",
    delete_content_type_field: "high",
    disable_content_type_field: "low",
    omit_content_type_field: "high",
    upload_asset: "low",
    create_upload_session: "low",
    list_assets: "never_ask",
    get_asset: "never_ask",
    update_asset: "low",
    publish_asset: "high",
    unpublish_asset: "high",
    archive_asset: "low",
    unarchive_asset: "low",
    delete_asset: "high",
    list_releases: "never_ask",
    get_release: "never_ask",
    create_release: "low",
    update_release: "low",
    publish_release: "high",
    unpublish_release: "high",
    validate_release: "never_ask",
    get_release_action: "never_ask",
    list_release_actions: "never_ask",
    schedule_publish_release: "high",
    schedule_unpublish_release: "high",
    cancel_scheduled_release: "low",
    list_scheduled_actions: "never_ask",
    list_spaces: "never_ask",
    get_space: "never_ask",
    list_environments: "never_ask",
    create_environment: "low",
    delete_environment: "high",
    list_orgs: "never_ask",
    get_org: "never_ask",
    list_locales: "never_ask",
    get_locale: "never_ask",
    create_locale: "low",
    update_locale: "low",
    delete_locale: "high",
    list_tags: "never_ask",
    create_tag: "low",
    create_ai_action: "low",
    invoke_ai_action: "high",
    get_ai_action: "never_ask",
    get_ai_action_invocation: "never_ask",
    list_ai_actions: "never_ask",
    update_ai_action: "low",
    publish_ai_action: "low",
    unpublish_ai_action: "low",
    delete_ai_action: "high",
    list_concepts: "never_ask",
    get_concept: "never_ask",
    create_concept: "low",
    update_concept: "low",
    delete_concept: "high",
    list_concept_schemes: "never_ask",
    get_concept_scheme: "never_ask",
    create_concept_scheme: "low",
    update_concept_scheme: "low",
    delete_concept_scheme: "high",
    get_editor_interface: "never_ask",
    list_editor_interfaces: "never_ask",
    update_editor_interface: "low",
  },
  toolDisplayLabels: {
    get_initial_context: {
      running: "Loading workspace context on Contentful",
      done: "Loaded workspace context on Contentful",
    },
    search_entries: {
      running: "Searching entries on Contentful",
      done: "Searched entries on Contentful",
    },
    semantic_search: {
      running: "Running a semantic search on Contentful",
      done: "Ran a semantic search on Contentful",
    },
    get_entry: {
      running: "Getting an entry on Contentful",
      done: "Got an entry on Contentful",
    },
    create_entry: {
      running: "Creating an entry on Contentful",
      done: "Created an entry on Contentful",
    },
    update_entry: {
      running: "Updating an entry on Contentful",
      done: "Updated an entry on Contentful",
    },
    publish_entry: {
      running: "Publishing an entry on Contentful",
      done: "Published an entry on Contentful",
    },
    unpublish_entry: {
      running: "Unpublishing an entry on Contentful",
      done: "Unpublished an entry on Contentful",
    },
    archive_entry: {
      running: "Archiving an entry on Contentful",
      done: "Archived an entry on Contentful",
    },
    unarchive_entry: {
      running: "Unarchiving an entry on Contentful",
      done: "Unarchived an entry on Contentful",
    },
    delete_entry: {
      running: "Deleting an entry on Contentful",
      done: "Deleted an entry on Contentful",
    },
    get_entry_snapshot: {
      running: "Getting an entry snapshot on Contentful",
      done: "Got an entry snapshot on Contentful",
    },
    resolve_entry_references: {
      running: "Resolving entry references on Contentful",
      done: "Resolved entry references on Contentful",
    },
    list_content_types: {
      running: "Listing content types on Contentful",
      done: "Listed content types on Contentful",
    },
    get_content_type: {
      running: "Getting a content type on Contentful",
      done: "Got a content type on Contentful",
    },
    create_content_type: {
      running: "Creating a content type on Contentful",
      done: "Created a content type on Contentful",
    },
    update_content_type: {
      running: "Updating a content type on Contentful",
      done: "Updated a content type on Contentful",
    },
    publish_content_type: {
      running: "Publishing a content type on Contentful",
      done: "Published a content type on Contentful",
    },
    unpublish_content_type: {
      running: "Unpublishing a content type on Contentful",
      done: "Unpublished a content type on Contentful",
    },
    delete_content_type: {
      running: "Deleting a content type on Contentful",
      done: "Deleted a content type on Contentful",
    },
    delete_content_type_field: {
      running: "Deleting a content type field on Contentful",
      done: "Deleted a content type field on Contentful",
    },
    disable_content_type_field: {
      running: "Disabling a content type field on Contentful",
      done: "Disabled a content type field on Contentful",
    },
    omit_content_type_field: {
      running: "Omitting a content type field on Contentful",
      done: "Omitted a content type field on Contentful",
    },
    upload_asset: {
      running: "Uploading an asset on Contentful",
      done: "Uploaded an asset on Contentful",
    },
    create_upload_session: {
      running: "Starting an upload session on Contentful",
      done: "Started an upload session on Contentful",
    },
    list_assets: {
      running: "Listing assets on Contentful",
      done: "Listed assets on Contentful",
    },
    get_asset: {
      running: "Getting an asset on Contentful",
      done: "Got an asset on Contentful",
    },
    update_asset: {
      running: "Updating an asset on Contentful",
      done: "Updated an asset on Contentful",
    },
    publish_asset: {
      running: "Publishing an asset on Contentful",
      done: "Published an asset on Contentful",
    },
    unpublish_asset: {
      running: "Unpublishing an asset on Contentful",
      done: "Unpublished an asset on Contentful",
    },
    archive_asset: {
      running: "Archiving an asset on Contentful",
      done: "Archived an asset on Contentful",
    },
    unarchive_asset: {
      running: "Unarchiving an asset on Contentful",
      done: "Unarchived an asset on Contentful",
    },
    delete_asset: {
      running: "Deleting an asset on Contentful",
      done: "Deleted an asset on Contentful",
    },
    list_releases: {
      running: "Listing releases on Contentful",
      done: "Listed releases on Contentful",
    },
    get_release: {
      running: "Getting a release on Contentful",
      done: "Got a release on Contentful",
    },
    create_release: {
      running: "Creating a release on Contentful",
      done: "Created a release on Contentful",
    },
    update_release: {
      running: "Updating a release on Contentful",
      done: "Updated a release on Contentful",
    },
    publish_release: {
      running: "Publishing a release on Contentful",
      done: "Published a release on Contentful",
    },
    unpublish_release: {
      running: "Unpublishing a release on Contentful",
      done: "Unpublished a release on Contentful",
    },
    validate_release: {
      running: "Validating a release on Contentful",
      done: "Validated a release on Contentful",
    },
    get_release_action: {
      running: "Getting a release action on Contentful",
      done: "Got a release action on Contentful",
    },
    list_release_actions: {
      running: "Listing release actions on Contentful",
      done: "Listed release actions on Contentful",
    },
    schedule_publish_release: {
      running: "Scheduling the publishing of a release on Contentful",
      done: "Scheduled the publishing of a release on Contentful",
    },
    schedule_unpublish_release: {
      running: "Scheduling the unpublishing of a release on Contentful",
      done: "Scheduled the unpublishing of a release on Contentful",
    },
    cancel_scheduled_release: {
      running: "Canceling a scheduled release on Contentful",
      done: "Canceled a scheduled release on Contentful",
    },
    list_scheduled_actions: {
      running: "Listing scheduled actions on Contentful",
      done: "Listed scheduled actions on Contentful",
    },
    list_spaces: {
      running: "Listing spaces on Contentful",
      done: "Listed spaces on Contentful",
    },
    get_space: {
      running: "Getting a space on Contentful",
      done: "Got a space on Contentful",
    },
    list_environments: {
      running: "Listing environments on Contentful",
      done: "Listed environments on Contentful",
    },
    create_environment: {
      running: "Creating an environment on Contentful",
      done: "Created an environment on Contentful",
    },
    delete_environment: {
      running: "Deleting an environment on Contentful",
      done: "Deleted an environment on Contentful",
    },
    list_orgs: {
      running: "Listing organizations on Contentful",
      done: "Listed organizations on Contentful",
    },
    get_org: {
      running: "Getting an organization on Contentful",
      done: "Got an organization on Contentful",
    },
    list_locales: {
      running: "Listing locales on Contentful",
      done: "Listed locales on Contentful",
    },
    get_locale: {
      running: "Getting a locale on Contentful",
      done: "Got a locale on Contentful",
    },
    create_locale: {
      running: "Creating a locale on Contentful",
      done: "Created a locale on Contentful",
    },
    update_locale: {
      running: "Updating a locale on Contentful",
      done: "Updated a locale on Contentful",
    },
    delete_locale: {
      running: "Deleting a locale on Contentful",
      done: "Deleted a locale on Contentful",
    },
    list_tags: {
      running: "Listing tags on Contentful",
      done: "Listed tags on Contentful",
    },
    create_tag: {
      running: "Creating a tag on Contentful",
      done: "Created a tag on Contentful",
    },
    create_ai_action: {
      running: "Creating an AI action on Contentful",
      done: "Created an AI action on Contentful",
    },
    invoke_ai_action: {
      running: "Running an AI action on Contentful",
      done: "Ran an AI action on Contentful",
    },
    get_ai_action: {
      running: "Getting an AI action on Contentful",
      done: "Got an AI action on Contentful",
    },
    get_ai_action_invocation: {
      running: "Getting an AI action result on Contentful",
      done: "Got an AI action result on Contentful",
    },
    list_ai_actions: {
      running: "Listing AI actions on Contentful",
      done: "Listed AI actions on Contentful",
    },
    update_ai_action: {
      running: "Updating an AI action on Contentful",
      done: "Updated an AI action on Contentful",
    },
    publish_ai_action: {
      running: "Publishing an AI action on Contentful",
      done: "Published an AI action on Contentful",
    },
    unpublish_ai_action: {
      running: "Unpublishing an AI action on Contentful",
      done: "Unpublished an AI action on Contentful",
    },
    delete_ai_action: {
      running: "Deleting an AI action on Contentful",
      done: "Deleted an AI action on Contentful",
    },
    list_concepts: {
      running: "Listing concepts on Contentful",
      done: "Listed concepts on Contentful",
    },
    get_concept: {
      running: "Getting a concept on Contentful",
      done: "Got a concept on Contentful",
    },
    create_concept: {
      running: "Creating a concept on Contentful",
      done: "Created a concept on Contentful",
    },
    update_concept: {
      running: "Updating a concept on Contentful",
      done: "Updated a concept on Contentful",
    },
    delete_concept: {
      running: "Deleting a concept on Contentful",
      done: "Deleted a concept on Contentful",
    },
    list_concept_schemes: {
      running: "Listing concept schemes on Contentful",
      done: "Listed concept schemes on Contentful",
    },
    get_concept_scheme: {
      running: "Getting a concept scheme on Contentful",
      done: "Got a concept scheme on Contentful",
    },
    create_concept_scheme: {
      running: "Creating a concept scheme on Contentful",
      done: "Created a concept scheme on Contentful",
    },
    update_concept_scheme: {
      running: "Updating a concept scheme on Contentful",
      done: "Updated a concept scheme on Contentful",
    },
    delete_concept_scheme: {
      running: "Deleting a concept scheme on Contentful",
      done: "Deleted a concept scheme on Contentful",
    },
    get_editor_interface: {
      running: "Getting an editor interface on Contentful",
      done: "Got an editor interface on Contentful",
    },
    list_editor_interfaces: {
      running: "Listing editor interfaces on Contentful",
      done: "Listed editor interfaces on Contentful",
    },
    update_editor_interface: {
      running: "Updating an editor interface on Contentful",
      done: "Updated an editor interface on Contentful",
    },
  },
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
    ...AMPLITUDE_SHARED_CONFIG,
    id: 10018,
    name: "Amplitude",
    description:
      "Amplitude tools for product analytics — search, query, and create charts, dashboards, notebooks, experiments, and cohorts (Region: US).",
    url: "https://mcp.amplitude.com/mcp",
  },
  {
    ...AMPLITUDE_SHARED_CONFIG,
    id: 10019,
    name: "Amplitude Europe",
    description:
      "Amplitude tools for product analytics — search, query, and create charts, dashboards, notebooks, experiments, and cohorts (Region: EU).",
    url: "https://mcp.eu.amplitude.com/mcp",
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
    url: "https://public-api.spendesk.com/v1/mcp",
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
    ...QOBRA_SHARED_CONFIG,
    id: 10034,
    name: "Qobra",
    description:
      "Qobra tools to read your sales compensation data — commission plans, quotas, statements, payouts, reports, and dashboards, scoped to your Qobra permissions (Region: EU).",
    url: "https://mcp.qobra.co/mcp",
  },
  {
    ...QOBRA_SHARED_CONFIG,
    id: 10035,
    name: "Qobra US",
    description:
      "Qobra tools to read your sales compensation data — commission plans, quotas, statements, payouts, reports, and dashboards, scoped to your Qobra permissions (Region: US).",
    url: "https://mcp-us.qobra.co/mcp",
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
  {
    id: 10041,
    name: "Airtable",
    description:
      "Airtable tools for querying and managing bases, records, tables, interfaces, forms and automations.",
    url: "https://mcp.airtable.com/mcp",
    icon: "AirtableLogo",
    documentationUrl:
      "https://airtable.com/developers/agents/mcp/getting-started",
    connectionInstructions:
      "Airtable uses OAuth with dynamic client registration. You will be prompted to sign in with your Airtable account and choose the bases, apps and workspaces to connect.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      create_automation: "low",
      delete_automation: "high",
      fetch_automation_input_data: "never_ask",
      get_automation: "never_ask",
      get_create_automation_instructions: "never_ask",
      list_automations: "never_ask",
      test_automation_webhook_trigger: "high",
      update_automation: "low",

      create_base: "high",
      list_bases: "never_ask",
      search_bases: "never_ask",

      create_field: "high",
      update_field: "high",

      get_form_schema: "never_ask",
      submit_form: "high",

      create_interface: "high",
      create_page: "high",
      delete_interface: "high",
      delete_page: "high",
      list_records_for_page: "never_ask",
      get_record_for_page: "never_ask",
      describe_page_element: "never_ask",
      describe_page_type: "never_ask",
      list_pages_for_base: "never_ask",

      create_records_for_table: "low",
      delete_records_for_table: "high",
      display_records_for_table: "never_ask",
      list_records_for_table: "never_ask",
      revert_action: "high",
      search_candidate_linked_records: "never_ask",
      search_records: "never_ask",
      update_records_for_table: "low",

      create_table: "high",
      delete_table: "high",
      get_table_schema: "never_ask",
      list_views_for_table: "never_ask",
      list_tables_for_base: "never_ask",
      update_table: "high",

      list_workspaces: "never_ask",
      list_external_accounts: "never_ask",
    },
    toolDisplayLabels: {
      create_automation: {
        running: "Creating an automation on Airtable",
        done: "Created an automation on Airtable",
      },
      delete_automation: {
        running: "Deleting an automation on Airtable",
        done: "Deleted an automation on Airtable",
      },
      fetch_automation_input_data: {
        running: "Fetching automation options from Airtable",
        done: "Fetched automation options from Airtable",
      },
      get_automation: {
        running: "Getting automation details from Airtable",
        done: "Got automation details from Airtable",
      },
      get_create_automation_instructions: {
        running: "Getting automation instructions from Airtable",
        done: "Got automation instructions from Airtable",
      },
      list_automations: {
        running: "Listing automations on Airtable",
        done: "Listed automations on Airtable",
      },
      test_automation_webhook_trigger: {
        running: "Testing an automation webhook on Airtable",
        done: "Tested an automation webhook on Airtable",
      },
      update_automation: {
        running: "Updating an automation on Airtable",
        done: "Updated an automation on Airtable",
      },
      create_base: {
        running: "Creating a base on Airtable",
        done: "Created a base on Airtable",
      },
      list_bases: {
        running: "Listing bases on Airtable",
        done: "Listed bases on Airtable",
      },
      search_bases: {
        running: "Searching bases on Airtable",
        done: "Searched bases on Airtable",
      },
      create_field: {
        running: "Creating a field on Airtable",
        done: "Created a field on Airtable",
      },
      update_field: {
        running: "Updating a field on Airtable",
        done: "Updated a field on Airtable",
      },
      get_form_schema: {
        running: "Getting a form schema from Airtable",
        done: "Got a form schema from Airtable",
      },
      submit_form: {
        running: "Submitting a form on Airtable",
        done: "Submitted a form on Airtable",
      },
      create_interface: {
        running: "Creating an interface on Airtable",
        done: "Created an interface on Airtable",
      },
      create_page: {
        running: "Creating an interface page on Airtable",
        done: "Created an interface page on Airtable",
      },
      delete_interface: {
        running: "Deleting an interface on Airtable",
        done: "Deleted an interface on Airtable",
      },
      delete_page: {
        running: "Deleting an interface page on Airtable",
        done: "Deleted an interface page on Airtable",
      },
      list_records_for_page: {
        running: "Listing interface records on Airtable",
        done: "Listed interface records on Airtable",
      },
      get_record_for_page: {
        running: "Getting an interface record from Airtable",
        done: "Got an interface record from Airtable",
      },
      describe_page_element: {
        running: "Describing a page element on Airtable",
        done: "Described a page element on Airtable",
      },
      describe_page_type: {
        running: "Describing a page type on Airtable",
        done: "Described a page type on Airtable",
      },
      list_pages_for_base: {
        running: "Listing pages on Airtable",
        done: "Listed pages on Airtable",
      },
      create_records_for_table: {
        running: "Creating records on Airtable",
        done: "Created records on Airtable",
      },
      delete_records_for_table: {
        running: "Deleting records on Airtable",
        done: "Deleted records on Airtable",
      },
      display_records_for_table: {
        running: "Displaying records from Airtable",
        done: "Displayed records from Airtable",
      },
      list_records_for_table: {
        running: "Listing records from Airtable",
        done: "Listed records from Airtable",
      },
      revert_action: {
        running: "Reverting an Airtable action",
        done: "Reverted an Airtable action",
      },
      search_candidate_linked_records: {
        running: "Searching linked records on Airtable",
        done: "Searched linked records on Airtable",
      },
      search_records: {
        running: "Searching records on Airtable",
        done: "Searched records on Airtable",
      },
      update_records_for_table: {
        running: "Updating records on Airtable",
        done: "Updated records on Airtable",
      },
      create_table: {
        running: "Creating a table on Airtable",
        done: "Created a table on Airtable",
      },
      delete_table: {
        running: "Deleting a table on Airtable",
        done: "Deleted a table on Airtable",
      },
      get_table_schema: {
        running: "Getting a table schema from Airtable",
        done: "Got a table schema from Airtable",
      },
      list_views_for_table: {
        running: "Listing table views on Airtable",
        done: "Listed table views on Airtable",
      },
      list_tables_for_base: {
        running: "Listing tables on Airtable",
        done: "Listed tables on Airtable",
      },
      update_table: {
        running: "Updating a table on Airtable",
        done: "Updated a table on Airtable",
      },
      list_workspaces: {
        running: "Listing workspaces on Airtable",
        done: "Listed workspaces on Airtable",
      },
      list_external_accounts: {
        running: "Listing connected accounts on Airtable",
        done: "Listed connected accounts on Airtable",
      },
    },
  },
  {
    id: 10039,
    name: "Qonto",
    description: "Qonto tools for reading and managing business banking data.",
    url: "https://mcp.qonto.com/mcp",
    icon: "QontoLogo",
    documentationUrl: "https://docs.qonto.com/mcp/overview",
    connectionInstructions:
      "Qonto uses OAuth with dynamic client registration. Connect your Qonto organization to use its banking tools.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      get_organization: "never_ask",
      list_user_organizations: "never_ask",
      list_memberships: "never_ask",
      get_authenticated_membership: "never_ask",
      list_teams: "never_ask",
      list_labels: "never_ask",
      list_cards: "never_ask",
      list_transactions: "never_ask",
      get_transaction: "never_ask",
      export_transactions: "never_ask",
      list_statements: "never_ask",
      get_statement: "never_ask",
      get_attachment: "never_ask",
      list_transaction_attachments: "never_ask",
      export_transaction_attachments: "never_ask",
      list_clients: "never_ask",
      get_client: "never_ask",
      list_client_invoices: "never_ask",
      get_client_invoice: "never_ask",
      list_reminders: "never_ask",
      list_credit_notes: "never_ask",
      get_credit_note: "never_ask",
      list_quotes: "never_ask",
      get_quote: "never_ask",
      list_supplier_invoices: "never_ask",
      get_supplier_invoice: "never_ask",
      list_products: "never_ask",
      list_payment_links: "never_ask",
      get_payment_link: "never_ask",
      list_requests: "never_ask",
      list_cash_flow_categories: "never_ask",
      get_subscription: "never_ask",
      get_qonto_public_pricing: "never_ask",
      get_card_iframe_url: "high",
      create_membership: "high",
      create_team: "high",
      create_card: "high",
      update_card: "high",
      change_card_status: "high",
      remove_transaction_attachment: "high",
      request_attachment_upload: "high",
      upload_attachment: "high",
      create_client: "high",
      update_client: "high",
      delete_client: "high",
      modify_transaction_cash_flow_category: "high",
      create_cash_flow_category: "high",
      create_client_invoice: "high",
      update_client_invoice: "high",
      delete_client_invoice: "high",
      change_client_invoice_status: "high",
      mark_client_invoice_as_paid: "high",
      send_client_invoice: "high",
      create_reminder: "high",
      delete_reminder: "high",
      create_credit_note: "high",
      create_quote: "high",
      update_quote: "high",
      delete_quote: "high",
      send_quote: "high",
      change_supplier_invoice_status: "high",
      create_product: "high",
      create_payment_link: "high",
      create_card_request: "high",
      create_multi_transfer_request: "high",
      approve_request: "high",
      decline_request: "high",
    },
    toolDisplayLabels: {
      get_organization: {
        running: "Loading organization details from Qonto",
        done: "Loaded organization details from Qonto",
      },
      list_user_organizations: {
        running: "Listing organizations on Qonto",
        done: "Listed organizations on Qonto",
      },
      list_memberships: {
        running: "Listing memberships on Qonto",
        done: "Listed memberships on Qonto",
      },
      get_authenticated_membership: {
        running: "Loading your Qonto membership from Qonto",
        done: "Loaded your Qonto membership from Qonto",
      },
      list_teams: {
        running: "Listing teams on Qonto",
        done: "Listed teams on Qonto",
      },
      list_labels: {
        running: "Listing labels on Qonto",
        done: "Listed labels on Qonto",
      },
      list_cards: {
        running: "Listing cards on Qonto",
        done: "Listed cards on Qonto",
      },
      list_transactions: {
        running: "Listing transactions on Qonto",
        done: "Listed transactions on Qonto",
      },
      get_transaction: {
        running: "Loading a transaction from Qonto",
        done: "Loaded a transaction from Qonto",
      },
      export_transactions: {
        running: "Exporting transactions from Qonto",
        done: "Exported transactions from Qonto",
      },
      list_statements: {
        running: "Listing statements on Qonto",
        done: "Listed statements on Qonto",
      },
      get_statement: {
        running: "Loading a statement from Qonto",
        done: "Loaded a statement from Qonto",
      },
      get_attachment: {
        running: "Loading an attachment from Qonto",
        done: "Loaded an attachment from Qonto",
      },
      list_transaction_attachments: {
        running: "Listing transaction attachments on Qonto",
        done: "Listed transaction attachments on Qonto",
      },
      export_transaction_attachments: {
        running: "Exporting transaction attachments from Qonto",
        done: "Exported transaction attachments from Qonto",
      },
      list_clients: {
        running: "Listing clients on Qonto",
        done: "Listed clients on Qonto",
      },
      get_client: {
        running: "Loading a client from Qonto",
        done: "Loaded a client from Qonto",
      },
      list_client_invoices: {
        running: "Listing client invoices on Qonto",
        done: "Listed client invoices on Qonto",
      },
      get_client_invoice: {
        running: "Loading a client invoice from Qonto",
        done: "Loaded a client invoice from Qonto",
      },
      list_reminders: {
        running: "Listing invoice reminders on Qonto",
        done: "Listed invoice reminders on Qonto",
      },
      list_credit_notes: {
        running: "Listing credit notes on Qonto",
        done: "Listed credit notes on Qonto",
      },
      get_credit_note: {
        running: "Loading a credit note from Qonto",
        done: "Loaded a credit note from Qonto",
      },
      list_quotes: {
        running: "Listing quotes on Qonto",
        done: "Listed quotes on Qonto",
      },
      get_quote: {
        running: "Loading a quote from Qonto",
        done: "Loaded a quote from Qonto",
      },
      list_supplier_invoices: {
        running: "Listing supplier invoices on Qonto",
        done: "Listed supplier invoices on Qonto",
      },
      get_supplier_invoice: {
        running: "Loading a supplier invoice from Qonto",
        done: "Loaded a supplier invoice from Qonto",
      },
      list_products: {
        running: "Listing products on Qonto",
        done: "Listed products on Qonto",
      },
      list_payment_links: {
        running: "Listing payment links on Qonto",
        done: "Listed payment links on Qonto",
      },
      get_payment_link: {
        running: "Loading a payment link from Qonto",
        done: "Loaded a payment link from Qonto",
      },
      list_requests: {
        running: "Listing requests on Qonto",
        done: "Listed requests on Qonto",
      },
      list_cash_flow_categories: {
        running: "Listing cash flow categories on Qonto",
        done: "Listed cash flow categories on Qonto",
      },
      get_subscription: {
        running: "Loading the Qonto subscription from Qonto",
        done: "Loaded the Qonto subscription from Qonto",
      },
      get_qonto_public_pricing: {
        running: "Loading Qonto public pricing from Qonto",
        done: "Loaded Qonto public pricing from Qonto",
      },
      get_card_iframe_url: {
        running: "Preparing secure card details on Qonto",
        done: "Preparing secure card details on Qonto",
      },
      create_membership: {
        running: "Creating a membership on Qonto",
        done: "Created a membership on Qonto",
      },
      create_team: {
        running: "Creating a team on Qonto",
        done: "Created a team on Qonto",
      },
      create_card: {
        running: "Creating a card on Qonto",
        done: "Created a card on Qonto",
      },
      update_card: {
        running: "Updating a card on Qonto",
        done: "Updated a card on Qonto",
      },
      change_card_status: {
        running: "Changing a card status on Qonto",
        done: "Changed a card status on Qonto",
      },
      remove_transaction_attachment: {
        running: "Removing a transaction attachment on Qonto",
        done: "Removed a transaction attachment on Qonto",
      },
      request_attachment_upload: {
        running: "Preparing an attachment upload on Qonto",
        done: "Preparing an attachment upload on Qonto",
      },
      upload_attachment: {
        running: "Uploading an attachment on Qonto",
        done: "Uploaded an attachment on Qonto",
      },
      create_client: {
        running: "Creating a client on Qonto",
        done: "Created a client on Qonto",
      },
      update_client: {
        running: "Updating a client on Qonto",
        done: "Updated a client on Qonto",
      },
      delete_client: {
        running: "Deleting a client on Qonto",
        done: "Deleted a client on Qonto",
      },
      modify_transaction_cash_flow_category: {
        running: "Updating transaction categories on Qonto",
        done: "Updated transaction categories on Qonto",
      },
      create_cash_flow_category: {
        running: "Creating a cash flow category on Qonto",
        done: "Created a cash flow category on Qonto",
      },
      create_client_invoice: {
        running: "Creating a client invoice on Qonto",
        done: "Created a client invoice on Qonto",
      },
      update_client_invoice: {
        running: "Updating a client invoice on Qonto",
        done: "Updated a client invoice on Qonto",
      },
      delete_client_invoice: {
        running: "Deleting a client invoice on Qonto",
        done: "Deleted a client invoice on Qonto",
      },
      change_client_invoice_status: {
        running: "Changing a client invoice status on Qonto",
        done: "Changed a client invoice status on Qonto",
      },
      mark_client_invoice_as_paid: {
        running: "Marking a client invoice as paid on Qonto",
        done: "Marked a client invoice as paid on Qonto",
      },
      send_client_invoice: {
        running: "Sending a client invoice on Qonto",
        done: "Sent a client invoice on Qonto",
      },
      create_reminder: {
        running: "Creating an invoice reminder on Qonto",
        done: "Created an invoice reminder on Qonto",
      },
      delete_reminder: {
        running: "Deleting an invoice reminder on Qonto",
        done: "Deleted an invoice reminder on Qonto",
      },
      create_credit_note: {
        running: "Creating a credit note on Qonto",
        done: "Created a credit note on Qonto",
      },
      create_quote: {
        running: "Creating a quote on Qonto",
        done: "Created a quote on Qonto",
      },
      update_quote: {
        running: "Updating a quote on Qonto",
        done: "Updated a quote on Qonto",
      },
      delete_quote: {
        running: "Deleting a quote on Qonto",
        done: "Deleted a quote on Qonto",
      },
      send_quote: {
        running: "Sending a quote on Qonto",
        done: "Sent a quote on Qonto",
      },
      change_supplier_invoice_status: {
        running: "Changing a supplier invoice on Qonto",
        done: "Changed a supplier invoice on Qonto",
      },
      create_product: {
        running: "Creating a product on Qonto",
        done: "Created a product on Qonto",
      },
      create_payment_link: {
        running: "Creating a payment link on Qonto",
        done: "Created a payment link on Qonto",
      },
      create_card_request: {
        running: "Creating a card request on Qonto",
        done: "Created a card request on Qonto",
      },
      create_multi_transfer_request: {
        running: "Creating a multi-transfer request on Qonto",
        done: "Created a multi-transfer request on Qonto",
      },
      approve_request: {
        running: "Preparing request approval on Qonto",
        done: "Preparing request approval on Qonto",
      },
      decline_request: {
        running: "Declining a request on Qonto",
        done: "Declined a request on Qonto",
      },
    },
  },
  {
    id: 10040,
    name: "Figma",
    description:
      "Figma tools for reading design context, variables, components and screenshots, searching design systems, and creating or editing Design and FigJam files.",
    url: "https://mcp.figma.com/mcp",
    icon: "FigmaLogo",
    documentationUrl: "https://developers.figma.com/docs/figma-mcp-server/",
    connectionInstructions:
      "Figma uses OAuth. You will be prompted to sign in with your Figma account. The MCP can only access the files and libraries you can already see in Figma.",
    featureFlag: "figma_mcp",
    creditBasedPlansOnly: true,
    authMethod: "oauth-dynamic",
    supportedOAuthUseCases: ["platform_actions", "personal_actions"],
    scope: "mcp:connect",
    // Figma's DCR only registers Dust with this exact `client_uri` and rejects regional hosts
    // such as https://eu.dust.tt.
    dcrClientUri: "https://dust.tt",
    toolStakes: {
      whoami: "never_ask",
      get_design_context: "never_ask",
      get_metadata: "never_ask",
      get_screenshot: "never_ask",
      get_variable_defs: "never_ask",
      get_figjam: "never_ask",
      get_motion_context: "never_ask",
      get_libraries: "never_ask",
      search_design_system: "never_ask",
      download_assets: "never_ask",
      export_video: "never_ask",
      get_code_connect_map: "never_ask",
      get_code_connect_suggestions: "never_ask",
      get_context_for_code_connect: "never_ask",
      list_file_components_for_code_connect: "never_ask",
      get_generative_plugin: "never_ask",
      list_generative_plugins: "never_ask",
      get_shader: "never_ask",
      list_shaders: "never_ask",
      list_file_shaders: "never_ask",
      weave_list_tools: "never_ask",
      weave_get_tool_inputs: "never_ask",
      weave_get_tool_run_output: "never_ask",
      weave_find_model: "never_ask",
      weave_get_model_run_output: "never_ask",

      create_new_file: "low",
      generate_figma_design: "low",
      generate_diagram: "low",
      upload_assets: "low",
      add_code_connect_map: "low",
      send_code_connect_mappings: "low",
      create_generative_plugin: "low",
      create_shader: "low",
      weave_upload_asset: "low",
      weave_cancel_tool_run: "low",

      use_figma: "high",
      update_generative_plugin: "high",
      update_shader: "high",
      // Image generation and Weave runs spend the user's Figma or Weave credits.
      generate_image: "high",
      weave_run_tool: "high",
      weave_run_model: "high",
    },
    toolDisplayLabels: {
      whoami: {
        running: "Checking identity on Figma",
        done: "Checked identity on Figma",
      },
      get_design_context: {
        running: "Reading design context on Figma",
        done: "Read design context on Figma",
      },
      get_metadata: {
        running: "Reading layer metadata on Figma",
        done: "Read layer metadata on Figma",
      },
      get_screenshot: {
        running: "Capturing a screenshot on Figma",
        done: "Captured a screenshot on Figma",
      },
      get_variable_defs: {
        running: "Reading variables and styles on Figma",
        done: "Read variables and styles on Figma",
      },
      get_figjam: {
        running: "Reading a FigJam board on Figma",
        done: "Read a FigJam board on Figma",
      },
      get_motion_context: {
        running: "Reading motion context on Figma",
        done: "Read motion context on Figma",
      },
      get_libraries: {
        running: "Listing libraries on Figma",
        done: "Listed libraries on Figma",
      },
      search_design_system: {
        running: "Searching the design system on Figma",
        done: "Searched the design system on Figma",
      },
      download_assets: {
        running: "Downloading assets from Figma",
        done: "Downloaded assets from Figma",
      },
      export_video: {
        running: "Exporting a video from Figma",
        done: "Exported a video from Figma",
      },
      get_code_connect_map: {
        running: "Reading Code Connect mappings on Figma",
        done: "Read Code Connect mappings on Figma",
      },
      get_code_connect_suggestions: {
        running: "Suggesting Code Connect mappings on Figma",
        done: "Suggested Code Connect mappings on Figma",
      },
      get_context_for_code_connect: {
        running: "Reading Code Connect context on Figma",
        done: "Read Code Connect context on Figma",
      },
      list_file_components_for_code_connect: {
        running: "Listing library components on Figma",
        done: "Listed library components on Figma",
      },
      get_generative_plugin: {
        running: "Reading a generative plugin on Figma",
        done: "Read a generative plugin on Figma",
      },
      list_generative_plugins: {
        running: "Listing generative plugins on Figma",
        done: "Listed generative plugins on Figma",
      },
      get_shader: {
        running: "Reading a shader on Figma",
        done: "Read a shader on Figma",
      },
      list_shaders: {
        running: "Listing shaders on Figma",
        done: "Listed shaders on Figma",
      },
      list_file_shaders: {
        running: "Listing file shaders on Figma",
        done: "Listed file shaders on Figma",
      },
      weave_list_tools: {
        running: "Listing Weave tools on Figma",
        done: "Listed Weave tools on Figma",
      },
      weave_get_tool_inputs: {
        running: "Reading Weave tool inputs on Figma",
        done: "Read Weave tool inputs on Figma",
      },
      weave_get_tool_run_output: {
        running: "Reading a Weave run output on Figma",
        done: "Read a Weave run output on Figma",
      },
      weave_find_model: {
        running: "Finding a Weave model on Figma",
        done: "Found a Weave model on Figma",
      },
      weave_get_model_run_output: {
        running: "Reading a Weave model output on Figma",
        done: "Read a Weave model output on Figma",
      },
      create_new_file: {
        running: "Creating a file on Figma",
        done: "Created a file on Figma",
      },
      generate_figma_design: {
        running: "Generating a design on Figma",
        done: "Generated a design on Figma",
      },
      generate_diagram: {
        running: "Generating a FigJam diagram on Figma",
        done: "Generated a FigJam diagram on Figma",
      },
      upload_assets: {
        running: "Uploading assets to Figma",
        done: "Uploaded assets to Figma",
      },
      add_code_connect_map: {
        running: "Adding a Code Connect mapping on Figma",
        done: "Added a Code Connect mapping on Figma",
      },
      send_code_connect_mappings: {
        running: "Confirming Code Connect mappings on Figma",
        done: "Confirmed Code Connect mappings on Figma",
      },
      create_generative_plugin: {
        running: "Creating a generative plugin on Figma",
        done: "Created a generative plugin on Figma",
      },
      create_shader: {
        running: "Creating a shader on Figma",
        done: "Created a shader on Figma",
      },
      weave_upload_asset: {
        running: "Uploading a Weave asset to Figma",
        done: "Uploaded a Weave asset to Figma",
      },
      weave_cancel_tool_run: {
        running: "Cancelling a Weave run on Figma",
        done: "Cancelled a Weave run on Figma",
      },
      use_figma: {
        running: "Editing a file on Figma",
        done: "Edited a file on Figma",
      },
      update_generative_plugin: {
        running: "Updating a generative plugin on Figma",
        done: "Updated a generative plugin on Figma",
      },
      update_shader: {
        running: "Updating a shader on Figma",
        done: "Updated a shader on Figma",
      },
      weave_run_tool: {
        running: "Running a Weave tool on Figma",
        done: "Ran a Weave tool on Figma",
      },
      generate_image: {
        running: "Generating an image on Figma",
        done: "Generated an image on Figma",
      },
      weave_run_model: {
        running: "Running a Weave model on Figma",
        done: "Ran a Weave model on Figma",
      },
    },
  },
  {
    id: 10042,
    name: "Clay",
    description:
      "Clay tools for searching companies and contacts, enriching them with data points, and running Clay subroutines.",
    url: "https://api.clay.com/v3/mcp",
    icon: "ClayLogo",
    documentationUrl: "https://university.clay.com/fr/docs/connect-to-clay-mcp",
    connectionInstructions:
      "Clay uses OAuth with dynamic client registration. Connect your Clay workspace to use its tools. Tools consume your workspace credits at the same rate as in Clay.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      // Read-only
      get_credits_available: "never_ask",
      get_current_workspace: "never_ask",
      get_task: "never_ask",
      get_task_context: "never_ask",
      list_subroutines: "never_ask",
      get_subroutine_input_options: "never_ask",
      query_objects: "never_ask",
      ask_question_about_accounts: "never_ask",
      search_companies: "never_ask",
      search_contacts: "never_ask",
      load_more_search_results: "never_ask",
      track_event: "never_ask",
      // Enrich contacts by name
      search_contacts_by_name: "low",
      // Consume credits / run workflows
      add_company_data_points: "high",
      add_contact_data_points: "high",
      run_subroutine: "high",
      run_subroutine_direct: "high",
      run_subroutine_no_mapping: "high",
    },
    toolDisplayLabels: {
      add_company_data_points: {
        running: "Enriching companies on Clay",
        done: "Enriched companies on Clay",
      },
      add_contact_data_points: {
        running: "Enriching contacts on Clay",
        done: "Enriched contacts on Clay",
      },
      ask_question_about_accounts: {
        running: "Asking a question about accounts on Clay",
        done: "Asked a question about accounts on Clay",
      },
      get_credits_available: {
        running: "Checking available credits on Clay",
        done: "Checked available credits on Clay",
      },
      get_current_workspace: {
        running: "Loading the current workspace from Clay",
        done: "Loaded the current workspace from Clay",
      },
      get_subroutine_input_options: {
        running: "Loading subroutine input options from Clay",
        done: "Loaded subroutine input options from Clay",
      },
      get_task: {
        running: "Fetching a task from Clay",
        done: "Fetched a task from Clay",
      },
      get_task_context: {
        running: "Fetching task details from Clay",
        done: "Fetched task details from Clay",
      },
      list_subroutines: {
        running: "Listing subroutines on Clay",
        done: "Listed subroutines on Clay",
      },
      load_more_search_results: {
        running: "Loading more search results from Clay",
        done: "Loaded more search results from Clay",
      },
      query_objects: {
        running: "Searching accounts, contacts and deals on Clay",
        done: "Searched accounts, contacts and deals on Clay",
      },
      run_subroutine: {
        running: "Running a subroutine on Clay",
        done: "Ran a subroutine on Clay",
      },
      run_subroutine_direct: {
        running: "Running a subroutine on Clay",
        done: "Ran a subroutine on Clay",
      },
      run_subroutine_no_mapping: {
        running: "Running a subroutine on Clay",
        done: "Ran a subroutine on Clay",
      },
      search_companies: {
        running: "Searching companies on Clay",
        done: "Searched companies on Clay",
      },
      search_contacts: {
        running: "Searching contacts on Clay",
        done: "Searched contacts on Clay",
      },
      search_contacts_by_name: {
        running: "Searching contacts by name on Clay",
        done: "Searched contacts by name on Clay",
      },
      track_event: {
        running: "Tracking an event on Clay",
        done: "Tracked an event on Clay",
      },
    },
  },
  {
    id: 10043,
    name: "FullEnrich",
    description:
      "FullEnrich tools for B2B contact and company search, contact enrichment (emails, phones) and CSV export.",
    url: "https://mcp.fullenrich.com/mcp",
    icon: "FullEnrichLogo",
    documentationUrl: "https://help.fullenrich.com",
    connectionInstructions:
      "FullEnrich uses OAuth with dynamic client registration. Sign in with your FullEnrich account to connect. Enrichment and exports consume FullEnrich credits.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      // Free / read-only
      get_credits: "never_ask",
      list_industries: "never_ask",
      list_seniorities: "never_ask",
      list_functions_subfunctions: "never_ask",
      search_people: "never_ask",
      search_companies: "never_ask",
      search_contact_by_email: "never_ask",
      get_enrichment_results: "never_ask",
      // Consume credits
      enrich_search_contact: "high",
      enrich_bulk: "high",
      export_contacts: "high",
      export_companies: "high",
      export_enrichment_results: "low",
    },
    toolDisplayLabels: {
      get_credits: {
        running: "Checking credits on FullEnrich",
        done: "Checked credits on FullEnrich",
      },
      list_industries: {
        running: "Listing industries on FullEnrich",
        done: "Listed industries on FullEnrich",
      },
      list_seniorities: {
        running: "Listing seniorities on FullEnrich",
        done: "Listed seniorities on FullEnrich",
      },
      list_functions_subfunctions: {
        running: "Listing functions on FullEnrich",
        done: "Listed functions on FullEnrich",
      },
      search_people: {
        running: "Searching people on FullEnrich",
        done: "Searched people on FullEnrich",
      },
      search_companies: {
        running: "Searching companies on FullEnrich",
        done: "Searched companies on FullEnrich",
      },
      search_contact_by_email: {
        running: "Looking up a contact by email on FullEnrich",
        done: "Looked up a contact by email on FullEnrich",
      },
      enrich_search_contact: {
        running: "Enriching contacts on FullEnrich",
        done: "Enriched contacts on FullEnrich",
      },
      enrich_bulk: {
        running: "Enriching contacts in bulk on FullEnrich",
        done: "Enriched contacts in bulk on FullEnrich",
      },
      get_enrichment_results: {
        running: "Fetching enrichment results from FullEnrich",
        done: "Fetched enrichment results from FullEnrich",
      },
      export_contacts: {
        running: "Exporting contacts from FullEnrich",
        done: "Exported contacts from FullEnrich",
      },
      export_companies: {
        running: "Exporting companies from FullEnrich",
        done: "Exported companies from FullEnrich",
      },
      export_enrichment_results: {
        running: "Exporting enrichment results from FullEnrich",
        done: "Exported enrichment results from FullEnrich",
      },
    },
  },
  {
    id: 10044,
    name: "ClickUp",
    description:
      "ClickUp tools for searching and managing tasks, comments, time tracking, lists, folders, Docs and Chat.",
    url: "https://mcp.clickup.com/mcp",
    icon: "ClickUpLogo",
    documentationUrl:
      "https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server",
    connectionInstructions:
      "ClickUp uses OAuth. You will be prompted to sign in with your ClickUp account and choose the workspace to connect.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      search_workspace: "never_ask",
      search_tasks_by_type: "never_ask",
      search_tasks_by_tag: "never_ask",
      get_task: "never_ask",
      get_task_comments: "never_ask",
      get_threaded_replies: "never_ask",
      get_task_time_entries: "never_ask",
      get_time_entries_multiple: "never_ask",
      get_current_time_entry: "never_ask",
      get_workspace_hierarchy: "never_ask",
      get_list: "never_ask",
      get_folder: "never_ask",
      get_workspace_members: "never_ask",
      find_member_by_name: "never_ask",
      resolve_assignees: "never_ask",
      get_chat_channels: "never_ask",
      list_document_pages: "never_ask",
      get_document_pages: "never_ask",
      get_time_in_status_task: "never_ask",
      get_time_in_status_list: "never_ask",
      create_task: "low",
      update_task: "low",
      set_custom_fields: "low",
      attach_file_to_task: "low",
      add_tag_to_task: "low",
      remove_tag_from_task: "low",
      add_task_link: "low",
      add_dependency: "low",
      move_task_to_list: "low",
      add_task_to_list: "low",
      start_time_tracking: "low",
      stop_time_tracking: "low",
      add_time_entry: "low",
      create_list: "low",
      create_list_in_folder: "low",
      update_list: "low",
      create_folder: "low",
      update_folder: "low",
      create_document: "low",
      create_document_page: "low",
      update_document_page: "low",
      delete_task: "high",
      create_bulk_tasks: "high",
      update_bulk_tasks: "high",
      remove_task_link: "high",
      remove_dependency: "high",
      create_task_comment: "high",
      send_chat_message: "high",
    },
    toolDisplayLabels: {
      search_workspace: {
        running: "Searching the ClickUp workspace",
        done: "Searched the ClickUp workspace",
      },
      search_tasks_by_type: {
        running: "Searching tasks by type on ClickUp",
        done: "Searched tasks by type on ClickUp",
      },
      search_tasks_by_tag: {
        running: "Searching tasks by tag on ClickUp",
        done: "Searched tasks by tag on ClickUp",
      },
      get_task: {
        running: "Loading a task from ClickUp",
        done: "Loaded a task from ClickUp",
      },
      get_task_comments: {
        running: "Loading task comments from ClickUp",
        done: "Loaded task comments from ClickUp",
      },
      get_threaded_replies: {
        running: "Loading threaded replies from ClickUp",
        done: "Loaded threaded replies from ClickUp",
      },
      get_task_time_entries: {
        running: "Loading task time entries from ClickUp",
        done: "Loaded task time entries from ClickUp",
      },
      get_time_entries_multiple: {
        running: "Loading time entries from ClickUp",
        done: "Loaded time entries from ClickUp",
      },
      get_current_time_entry: {
        running: "Checking the running timer on ClickUp",
        done: "Checked the running timer on ClickUp",
      },
      get_workspace_hierarchy: {
        running: "Loading the workspace hierarchy from ClickUp",
        done: "Loaded the workspace hierarchy from ClickUp",
      },
      get_list: {
        running: "Loading a list from ClickUp",
        done: "Loaded a list from ClickUp",
      },
      get_folder: {
        running: "Loading a folder from ClickUp",
        done: "Loaded a folder from ClickUp",
      },
      get_workspace_members: {
        running: "Listing workspace members on ClickUp",
        done: "Listed workspace members on ClickUp",
      },
      find_member_by_name: {
        running: "Finding a member on ClickUp",
        done: "Found a member on ClickUp",
      },
      resolve_assignees: {
        running: "Resolving assignees on ClickUp",
        done: "Resolved assignees on ClickUp",
      },
      get_chat_channels: {
        running: "Listing chat channels on ClickUp",
        done: "Listed chat channels on ClickUp",
      },
      list_document_pages: {
        running: "Listing Doc pages on ClickUp",
        done: "Listed Doc pages on ClickUp",
      },
      get_document_pages: {
        running: "Loading Doc pages from ClickUp",
        done: "Loaded Doc pages from ClickUp",
      },
      get_time_in_status_task: {
        running: "Loading time in status for a task on ClickUp",
        done: "Loaded time in status for a task on ClickUp",
      },
      get_time_in_status_list: {
        running: "Loading time in status for a list on ClickUp",
        done: "Loaded time in status for a list on ClickUp",
      },
      create_task: {
        running: "Creating a task on ClickUp",
        done: "Created a task on ClickUp",
      },
      update_task: {
        running: "Updating a task on ClickUp",
        done: "Updated a task on ClickUp",
      },
      set_custom_fields: {
        running: "Setting custom fields on ClickUp",
        done: "Set custom fields on ClickUp",
      },
      attach_file_to_task: {
        running: "Attaching a file to a task on ClickUp",
        done: "Attached a file to a task on ClickUp",
      },
      add_tag_to_task: {
        running: "Adding a tag to a task on ClickUp",
        done: "Added a tag to a task on ClickUp",
      },
      remove_tag_from_task: {
        running: "Removing a tag from a task on ClickUp",
        done: "Removed a tag from a task on ClickUp",
      },
      add_task_link: {
        running: "Linking tasks on ClickUp",
        done: "Linked tasks on ClickUp",
      },
      add_dependency: {
        running: "Adding a task dependency on ClickUp",
        done: "Added a task dependency on ClickUp",
      },
      move_task_to_list: {
        running: "Moving a task to another list on ClickUp",
        done: "Moved a task to another list on ClickUp",
      },
      add_task_to_list: {
        running: "Adding a task to a list on ClickUp",
        done: "Added a task to a list on ClickUp",
      },
      start_time_tracking: {
        running: "Starting the timer on ClickUp",
        done: "Started the timer on ClickUp",
      },
      stop_time_tracking: {
        running: "Stopping the timer on ClickUp",
        done: "Stopped the timer on ClickUp",
      },
      add_time_entry: {
        running: "Adding a time entry on ClickUp",
        done: "Added a time entry on ClickUp",
      },
      create_list: {
        running: "Creating a list on ClickUp",
        done: "Created a list on ClickUp",
      },
      create_list_in_folder: {
        running: "Creating a list in a folder on ClickUp",
        done: "Created a list in a folder on ClickUp",
      },
      update_list: {
        running: "Updating a list on ClickUp",
        done: "Updated a list on ClickUp",
      },
      create_folder: {
        running: "Creating a folder on ClickUp",
        done: "Created a folder on ClickUp",
      },
      update_folder: {
        running: "Updating a folder on ClickUp",
        done: "Updated a folder on ClickUp",
      },
      create_document: {
        running: "Creating a Doc on ClickUp",
        done: "Created a Doc on ClickUp",
      },
      create_document_page: {
        running: "Creating a Doc page on ClickUp",
        done: "Created a Doc page on ClickUp",
      },
      update_document_page: {
        running: "Updating a Doc page on ClickUp",
        done: "Updated a Doc page on ClickUp",
      },
      delete_task: {
        running: "Deleting a task on ClickUp",
        done: "Deleted a task on ClickUp",
      },
      create_bulk_tasks: {
        running: "Creating multiple tasks on ClickUp",
        done: "Created multiple tasks on ClickUp",
      },
      update_bulk_tasks: {
        running: "Updating multiple tasks on ClickUp",
        done: "Updated multiple tasks on ClickUp",
      },
      remove_task_link: {
        running: "Removing a task link on ClickUp",
        done: "Removed a task link on ClickUp",
      },
      remove_dependency: {
        running: "Removing a task dependency on ClickUp",
        done: "Removed a task dependency on ClickUp",
      },
      create_task_comment: {
        running: "Commenting on a task on ClickUp",
        done: "Commented on a task on ClickUp",
      },
      send_chat_message: {
        running: "Sending a chat message on ClickUp",
        done: "Sent a chat message on ClickUp",
      },
    },
  },
  {
    id: 10045,
    name: "Superhuman Docs",
    description:
      "Superhuman Docs (Coda) tools for searching, reading and editing docs, pages, tables, comments and formulas.",
    url: "https://docs.superhuman.com/apis/mcp",
    icon: "SuperhumanLogo",
    documentationUrl:
      "https://help.superhuman.com/hc/en-us/articles/46210076980365-Connect-to-the-Superhuman-Docs-MCP",
    connectionInstructions:
      "Superhuman Docs (Coda) uses OAuth with dynamic client registration. Sign in with your Superhuman or Coda account to connect.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      content_read: "never_ask",
      document_outline: "never_ask",
      control_read: "never_ask",
      formula_execute: "never_ask",
      name_match: "never_ask",
      page_describe: "never_ask",
      table_columns_read: "never_ask",
      table_rows_read: "never_ask",
      tool_guide: "never_ask",
      url_convert: "never_ask",
      whoami: "never_ask",
      notifications_list: "never_ask",
      search: "never_ask",
      comment_add: "high",
      comment_delete: "high",
      comment_resolve: "high",
      content_image_upload: "high",
      content_modify: "high",
      document_suggest_changes: "high",
      control_delete: "high",
      control_manage: "high",
      page_create: "high",
      page_delete: "high",
      page_update: "high",
      table_columns_manage: "high",
      table_create: "high",
      table_delete: "high",
      table_columns_delete: "high",
      table_rows_delete: "high",
      table_rows_manage: "high",
      table_view_delete: "high",
      table_view_manage: "high",
      content_duplicate: "high",
      document_create: "high",
      document_delete: "high",
      document_manage: "high",
      notifications_mark_read: "high",
    },
    toolDisplayLabels: {
      content_read: {
        running: "Reading content on Superhuman Docs",
        done: "Read content on Superhuman Docs",
      },
      document_outline: {
        running: "Loading a doc outline from Superhuman Docs",
        done: "Loaded a doc outline from Superhuman Docs",
      },
      control_read: {
        running: "Reading a control on Superhuman Docs",
        done: "Read a control on Superhuman Docs",
      },
      formula_execute: {
        running: "Running a formula on Superhuman Docs",
        done: "Ran a formula on Superhuman Docs",
      },
      name_match: {
        running: "Matching names on Superhuman Docs",
        done: "Matched names on Superhuman Docs",
      },
      page_describe: {
        running: "Describing a page on Superhuman Docs",
        done: "Described a page on Superhuman Docs",
      },
      table_columns_read: {
        running: "Reading table columns on Superhuman Docs",
        done: "Read table columns on Superhuman Docs",
      },
      table_rows_read: {
        running: "Reading table rows on Superhuman Docs",
        done: "Read table rows on Superhuman Docs",
      },
      tool_guide: {
        running: "Loading a tool guide from Superhuman Docs",
        done: "Loaded a tool guide from Superhuman Docs",
      },
      url_convert: {
        running: "Converting a URL on Superhuman Docs",
        done: "Converted a URL on Superhuman Docs",
      },
      whoami: {
        running: "Checking the current user on Superhuman Docs",
        done: "Checked the current user on Superhuman Docs",
      },
      notifications_list: {
        running: "Listing notifications on Superhuman Docs",
        done: "Listed notifications on Superhuman Docs",
      },
      search: {
        running: "Searching Superhuman Docs",
        done: "Searched Superhuman Docs",
      },
      comment_add: {
        running: "Adding a comment on Superhuman Docs",
        done: "Added a comment on Superhuman Docs",
      },
      comment_delete: {
        running: "Deleting a comment on Superhuman Docs",
        done: "Deleted a comment on Superhuman Docs",
      },
      comment_resolve: {
        running: "Updating a comment thread on Superhuman Docs",
        done: "Updated a comment thread on Superhuman Docs",
      },
      content_image_upload: {
        running: "Uploading an image to Superhuman Docs",
        done: "Uploaded an image to Superhuman Docs",
      },
      content_modify: {
        running: "Modifying content on Superhuman Docs",
        done: "Modified content on Superhuman Docs",
      },
      document_suggest_changes: {
        running: "Suggesting changes on Superhuman Docs",
        done: "Suggested changes on Superhuman Docs",
      },
      control_delete: {
        running: "Deleting a control on Superhuman Docs",
        done: "Deleted a control on Superhuman Docs",
      },
      control_manage: {
        running: "Managing a control on Superhuman Docs",
        done: "Managed a control on Superhuman Docs",
      },
      page_create: {
        running: "Creating a page on Superhuman Docs",
        done: "Created a page on Superhuman Docs",
      },
      page_delete: {
        running: "Deleting a page on Superhuman Docs",
        done: "Deleted a page on Superhuman Docs",
      },
      page_update: {
        running: "Updating a page on Superhuman Docs",
        done: "Updated a page on Superhuman Docs",
      },
      table_columns_manage: {
        running: "Managing table columns on Superhuman Docs",
        done: "Managed table columns on Superhuman Docs",
      },
      table_create: {
        running: "Creating a table on Superhuman Docs",
        done: "Created a table on Superhuman Docs",
      },
      table_delete: {
        running: "Deleting a table on Superhuman Docs",
        done: "Deleted a table on Superhuman Docs",
      },
      table_columns_delete: {
        running: "Deleting table columns on Superhuman Docs",
        done: "Deleted table columns on Superhuman Docs",
      },
      table_rows_delete: {
        running: "Deleting table rows on Superhuman Docs",
        done: "Deleted table rows on Superhuman Docs",
      },
      table_rows_manage: {
        running: "Managing table rows on Superhuman Docs",
        done: "Managed table rows on Superhuman Docs",
      },
      table_view_delete: {
        running: "Deleting a table view on Superhuman Docs",
        done: "Deleted a table view on Superhuman Docs",
      },
      table_view_manage: {
        running: "Managing a table view on Superhuman Docs",
        done: "Managed a table view on Superhuman Docs",
      },
      content_duplicate: {
        running: "Duplicating content on Superhuman Docs",
        done: "Duplicated content on Superhuman Docs",
      },
      document_create: {
        running: "Creating a doc on Superhuman Docs",
        done: "Created a doc on Superhuman Docs",
      },
      document_delete: {
        running: "Deleting a doc on Superhuman Docs",
        done: "Deleted a doc on Superhuman Docs",
      },
      document_manage: {
        running: "Managing doc access on Superhuman Docs",
        done: "Managed doc access on Superhuman Docs",
      },
      notifications_mark_read: {
        running: "Marking notifications as read on Superhuman Docs",
        done: "Marked notifications as read on Superhuman Docs",
      },
    },
  },
  {
    id: 10046,
    name: "Paddle",
    description:
      "Manage Paddle pricing, billing, subscriptions, and integrations through Paddle's hosted MCP server.",
    url: "https://mcp.paddle.com/mcp",
    icon: "PaddleLogo",
    documentationUrl: "https://developer.paddle.com/sdks/ai/paddle-mcp/",
    connectionInstructions:
      "Connect to your Paddle live account with OAuth. Access starts with the read permissions allowed by your Paddle role; adjust permissions in Paddle > Connectors > MCP.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      search: "never_ask",
      execute: "high",
      report_missing_tool: "low",
    },
    toolDisplayLabels: {
      search: {
        running: "Searching Paddle",
        done: "Searched Paddle",
      },
      execute: {
        running: "Running a Paddle operation",
        done: "Ran a Paddle operation",
      },
      report_missing_tool: {
        running: "Reporting a missing Paddle capability",
        done: "Reported a missing Paddle capability",
      },
    },
  },
  {
    ...PANDADOC_SHARED_CONFIG,
    id: 10047,
    name: "PandaDoc",
    description:
      "PandaDoc tools for creating, editing, sending and tracking documents, templates, recipients, contacts and product catalog items (Region: Global).",
    url: "https://mcp.pandadoc.com/v1/mcp",
    connectionInstructions:
      "PandaDoc uses OAuth with dynamic client registration. Sign in with your PandaDoc account. Use this server if your account is on app.pandadoc.com; authentication fails if the server region does not match your account region.",
  },
  {
    ...PANDADOC_SHARED_CONFIG,
    id: 10048,
    name: "PandaDoc (Europe)",
    description:
      "PandaDoc tools for creating, editing, sending and tracking documents, templates, recipients, contacts and product catalog items (Region: EU).",
    url: "https://mcp.pandadoc.eu/v1/mcp",
    connectionInstructions:
      "PandaDoc uses OAuth with dynamic client registration. Sign in with your PandaDoc account. Use this server if your account is on app.pandadoc.eu; authentication fails if the server region does not match your account region.",
  },
  {
    id: 10049,
    name: "Airbyte",
    description:
      "Airbyte tools to deploy and manage Airbyte Cloud connectors, connections and sync jobs, and to query the data synced through them.",
    url: "https://mcp.airbyte.com/mcp",
    icon: "AirbyteLogo",
    documentationUrl: "https://docs.airbyte.com/platform/airbyte-mcp/install",
    connectionInstructions:
      "Airbyte uses OAuth with dynamic client registration. Sign in with your Airbyte Cloud account to connect. Your organization must be enrolled in the Airbyte MCP beta, and an organization admin must enable the context layer for tools that read data through connectors.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      get_default_cloud_context: "never_ask",
      list_cloud_workspaces: "never_ask",
      describe_cloud_workspace: "never_ask",
      list_cloud_organizations: "never_ask",
      describe_cloud_organization: "never_ask",
      get_cloud_organization_billing_status: "never_ask",
      list_cloud_connectors: "never_ask",
      describe_cloud_connector: "never_ask",
      check_cloud_connector: "never_ask",
      list_cloud_connections: "never_ask",
      describe_cloud_connection: "never_ask",
      get_connection_artifact: "never_ask",
      list_cloud_sync_jobs: "never_ask",
      get_cloud_sync_status: "never_ask",
      get_cloud_sync_logs: "never_ask",
      get_cloud_search_status: "never_ask",
      execute_external_sql_query: "never_ask",
      execute_external_search_query: "never_ask",
      list_custom_source_definitions: "never_ask",
      get_custom_source_definition: "never_ask",
      get_connector_builder_draft_manifest: "never_ask",
      list_connectors: "never_ask",
      get_connector_info: "never_ask",
      get_connector_version_history: "never_ask",
      get_api_docs_urls: "never_ask",
      get_agent_skill_docs: "never_ask",
      search_airbyte_knowledge_sources: "never_ask",
      deploy_connector_to_cloud: "high",
      deploy_noop_destination_to_cloud: "high",
      create_connection_on_cloud: "high",
      run_cloud_sync: "high",
      cancel_cloud_sync: "high",
      set_default_cloud_workspace: "high",
      rename_cloud_connector: "high",
      update_cloud_connector_config: "high",
      rename_cloud_connection: "high",
      set_cloud_connection_table_prefix: "high",
      set_cloud_connection_selected_streams: "high",
      update_cloud_connection: "high",
      publish_custom_source_definition: "high",
      update_custom_source_definition: "high",
      permanently_delete_custom_source_definition: "high",
      permanently_delete_cloud_connector: "high",
      permanently_delete_cloud_connection: "high",
      execute_external_api_query: "high",
    },
    toolDisplayLabels: {
      get_default_cloud_context: {
        running: "Getting the default context on Airbyte",
        done: "Got the default context on Airbyte",
      },
      list_cloud_workspaces: {
        running: "Listing workspaces on Airbyte",
        done: "Listed workspaces on Airbyte",
      },
      describe_cloud_workspace: {
        running: "Getting workspace details on Airbyte",
        done: "Got workspace details on Airbyte",
      },
      list_cloud_organizations: {
        running: "Listing organizations on Airbyte",
        done: "Listed organizations on Airbyte",
      },
      describe_cloud_organization: {
        running: "Getting organization details on Airbyte",
        done: "Got organization details on Airbyte",
      },
      get_cloud_organization_billing_status: {
        running: "Getting billing status on Airbyte",
        done: "Got billing status on Airbyte",
      },
      list_cloud_connectors: {
        running: "Listing connectors on Airbyte",
        done: "Listed connectors on Airbyte",
      },
      describe_cloud_connector: {
        running: "Getting connector details on Airbyte",
        done: "Got connector details on Airbyte",
      },
      check_cloud_connector: {
        running: "Checking a connector on Airbyte",
        done: "Checked a connector on Airbyte",
      },
      list_cloud_connections: {
        running: "Listing connections on Airbyte",
        done: "Listed connections on Airbyte",
      },
      describe_cloud_connection: {
        running: "Getting connection details on Airbyte",
        done: "Got connection details on Airbyte",
      },
      get_connection_artifact: {
        running: "Getting a connection artifact from Airbyte",
        done: "Got a connection artifact from Airbyte",
      },
      list_cloud_sync_jobs: {
        running: "Listing sync jobs on Airbyte",
        done: "Listed sync jobs on Airbyte",
      },
      get_cloud_sync_status: {
        running: "Getting sync status on Airbyte",
        done: "Got sync status on Airbyte",
      },
      get_cloud_sync_logs: {
        running: "Getting sync logs from Airbyte",
        done: "Got sync logs from Airbyte",
      },
      get_cloud_search_status: {
        running: "Getting search indexing status on Airbyte",
        done: "Got search indexing status on Airbyte",
      },
      execute_external_sql_query: {
        running: "Running a SQL query on Airbyte",
        done: "Ran a SQL query on Airbyte",
      },
      execute_external_search_query: {
        running: "Searching synced data on Airbyte",
        done: "Searched synced data on Airbyte",
      },
      list_custom_source_definitions: {
        running: "Listing custom sources on Airbyte",
        done: "Listed custom sources on Airbyte",
      },
      get_custom_source_definition: {
        running: "Getting a custom source on Airbyte",
        done: "Got a custom source on Airbyte",
      },
      get_connector_builder_draft_manifest: {
        running: "Getting a draft manifest on Airbyte",
        done: "Got a draft manifest on Airbyte",
      },
      list_connectors: {
        running: "Listing available connectors on Airbyte",
        done: "Listed available connectors on Airbyte",
      },
      get_connector_info: {
        running: "Getting connector info on Airbyte",
        done: "Got connector info on Airbyte",
      },
      get_connector_version_history: {
        running: "Getting connector version history on Airbyte",
        done: "Got connector version history on Airbyte",
      },
      get_api_docs_urls: {
        running: "Getting API docs links on Airbyte",
        done: "Got API docs links on Airbyte",
      },
      get_agent_skill_docs: {
        running: "Getting skill docs on Airbyte",
        done: "Got skill docs on Airbyte",
      },
      search_airbyte_knowledge_sources: {
        running: "Searching Airbyte documentation",
        done: "Searched Airbyte documentation",
      },
      deploy_connector_to_cloud: {
        running: "Deploying a connector on Airbyte",
        done: "Deployed a connector on Airbyte",
      },
      deploy_noop_destination_to_cloud: {
        running: "Deploying a test destination on Airbyte",
        done: "Deployed a test destination on Airbyte",
      },
      create_connection_on_cloud: {
        running: "Creating a connection on Airbyte",
        done: "Created a connection on Airbyte",
      },
      run_cloud_sync: {
        running: "Running a sync on Airbyte",
        done: "Ran a sync on Airbyte",
      },
      cancel_cloud_sync: {
        running: "Canceling a sync on Airbyte",
        done: "Canceled a sync on Airbyte",
      },
      set_default_cloud_workspace: {
        running: "Setting the default workspace on Airbyte",
        done: "Set the default workspace on Airbyte",
      },
      rename_cloud_connector: {
        running: "Renaming a connector on Airbyte",
        done: "Renamed a connector on Airbyte",
      },
      update_cloud_connector_config: {
        running: "Updating a connector configuration on Airbyte",
        done: "Updated a connector configuration on Airbyte",
      },
      rename_cloud_connection: {
        running: "Renaming a connection on Airbyte",
        done: "Renamed a connection on Airbyte",
      },
      set_cloud_connection_table_prefix: {
        running: "Setting a table prefix on Airbyte",
        done: "Set a table prefix on Airbyte",
      },
      set_cloud_connection_selected_streams: {
        running: "Setting selected streams on Airbyte",
        done: "Set selected streams on Airbyte",
      },
      update_cloud_connection: {
        running: "Updating a connection on Airbyte",
        done: "Updated a connection on Airbyte",
      },
      publish_custom_source_definition: {
        running: "Publishing a custom source on Airbyte",
        done: "Published a custom source on Airbyte",
      },
      update_custom_source_definition: {
        running: "Updating a custom source on Airbyte",
        done: "Updated a custom source on Airbyte",
      },
      permanently_delete_custom_source_definition: {
        running: "Deleting a custom source on Airbyte",
        done: "Deleted a custom source on Airbyte",
      },
      permanently_delete_cloud_connector: {
        running: "Deleting a connector on Airbyte",
        done: "Deleted a connector on Airbyte",
      },
      permanently_delete_cloud_connection: {
        running: "Deleting a connection on Airbyte",
        done: "Deleted a connection on Airbyte",
      },
      execute_external_api_query: {
        running: "Querying an external API on Airbyte",
        done: "Queried an external API on Airbyte",
      },
    },
  },
  {
    id: 10050,
    name: "n8n",
    description:
      "n8n tools to search, run and build workflows, and to manage data tables and AI agents on your n8n instance.",
    url: "",
    icon: "N8NLogo",
    documentationUrl: "https://docs.n8n.io/connect/connect-to-n8n-mcp-server",
    connectionInstructions:
      "Enter your n8n instance's MCP server URL, found in n8n under Settings > Instance-level MCP (e.g. https://your-instance.app.n8n.cloud/mcp-server/http, or https://your-domain/mcp-server/http when self-hosted). The instance must be reachable over HTTPS. n8n uses OAuth with dynamic client registration. Sign in with your n8n account to connect. An instance owner or admin must first enable instance-level MCP, and each workflow or agent must be marked as available in MCP.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      search_workflows: "never_ask",
      get_workflow_details: "never_ask",
      get_workflow_execution: "never_ask",
      search_workflow_executions: "never_ask",
      get_workflow_history: "never_ask",
      get_workflow_version: "never_ask",
      get_workflow_versions_diff: "never_ask",
      prepare_workflow_pin_data: "never_ask",
      list_credentials: "never_ask",
      list_n8n_gateway_services: "never_ask",
      list_workflow_tags: "never_ask",
      search_data_tables: "never_ask",
      get_data_table_rows: "never_ask",
      search_nodes: "never_ask",
      get_node_types: "never_ask",
      get_workflow_best_practices: "never_ask",
      explore_node_resources: "never_ask",
      validate_workflow: "never_ask",
      validate_node_config: "never_ask",
      get_workflow_sdk_reference: "never_ask",
      search_projects: "never_ask",
      search_folders: "never_ask",
      search_agents: "never_ask",
      get_agent: "never_ask",
      list_agent_versions: "never_ask",
      get_agent_builder_reference: "never_ask",
      discover_agent_assets: "never_ask",
      validate_agent: "never_ask",
      execute_workflow: "high",
      test_workflow: "high",
      publish_workflow: "high",
      unpublish_workflow: "high",
      create_workflow_from_code: "high",
      update_workflow: "high",
      archive_workflow: "high",
      restore_workflow_version: "high",
      create_data_table: "high",
      rename_data_table: "high",
      add_data_table_column: "high",
      delete_data_table_column: "high",
      rename_data_table_column: "high",
      add_data_table_rows: "high",
      create_folder: "high",
      update_folder: "high",
      move_workflows_to_folder: "high",
      install_community_node: "high",
      create_agent: "high",
      mutate_agent: "high",
      call_agent: "high",
      publish_agent: "high",
      unpublish_agent: "high",
      revert_agent: "high",
      delete_agent: "high",
      verify_agent_mcp_server: "high",
      update_agent_integration: "high",
    },
    toolDisplayLabels: {
      search_workflows: {
        running: "Searching workflows on n8n",
        done: "Searched workflows on n8n",
      },
      get_workflow_details: {
        running: "Getting workflow details from n8n",
        done: "Got workflow details from n8n",
      },
      get_workflow_execution: {
        running: "Getting an execution from n8n",
        done: "Got an execution from n8n",
      },
      search_workflow_executions: {
        running: "Searching executions on n8n",
        done: "Searched executions on n8n",
      },
      get_workflow_history: {
        running: "Loading workflow history from n8n",
        done: "Loaded workflow history from n8n",
      },
      get_workflow_version: {
        running: "Getting a workflow version from n8n",
        done: "Got a workflow version from n8n",
      },
      get_workflow_versions_diff: {
        running: "Comparing workflow versions on n8n",
        done: "Compared workflow versions on n8n",
      },
      prepare_workflow_pin_data: {
        running: "Preparing test data on n8n",
        done: "Prepared test data on n8n",
      },
      list_credentials: {
        running: "Listing credentials on n8n",
        done: "Listed credentials on n8n",
      },
      list_n8n_gateway_services: {
        running: "Listing gateway services on n8n",
        done: "Listed gateway services on n8n",
      },
      list_workflow_tags: {
        running: "Listing workflow tags on n8n",
        done: "Listed workflow tags on n8n",
      },
      search_data_tables: {
        running: "Searching data tables on n8n",
        done: "Searched data tables on n8n",
      },
      get_data_table_rows: {
        running: "Reading data table rows from n8n",
        done: "Read data table rows from n8n",
      },
      search_nodes: {
        running: "Searching nodes on n8n",
        done: "Searched nodes on n8n",
      },
      get_node_types: {
        running: "Getting node types from n8n",
        done: "Got node types from n8n",
      },
      get_workflow_best_practices: {
        running: "Checking workflow best practices on n8n",
        done: "Checked workflow best practices on n8n",
      },
      explore_node_resources: {
        running: "Exploring node resources on n8n",
        done: "Explored node resources on n8n",
      },
      validate_workflow: {
        running: "Validating a workflow on n8n",
        done: "Validated a workflow on n8n",
      },
      validate_node_config: {
        running: "Validating a node config on n8n",
        done: "Validated a node config on n8n",
      },
      get_workflow_sdk_reference: {
        running: "Reading the workflow SDK reference on n8n",
        done: "Read the workflow SDK reference on n8n",
      },
      search_projects: {
        running: "Searching projects on n8n",
        done: "Searched projects on n8n",
      },
      search_folders: {
        running: "Searching folders on n8n",
        done: "Searched folders on n8n",
      },
      search_agents: {
        running: "Searching agents on n8n",
        done: "Searched agents on n8n",
      },
      get_agent: {
        running: "Getting an agent from n8n",
        done: "Got an agent from n8n",
      },
      list_agent_versions: {
        running: "Listing agent versions on n8n",
        done: "Listed agent versions on n8n",
      },
      get_agent_builder_reference: {
        running: "Reading the agent builder reference on n8n",
        done: "Read the agent builder reference on n8n",
      },
      discover_agent_assets: {
        running: "Discovering agent assets on n8n",
        done: "Discovered agent assets on n8n",
      },
      validate_agent: {
        running: "Validating an agent on n8n",
        done: "Validated an agent on n8n",
      },
      execute_workflow: {
        running: "Running a workflow on n8n",
        done: "Ran a workflow on n8n",
      },
      test_workflow: {
        running: "Testing a workflow on n8n",
        done: "Tested a workflow on n8n",
      },
      publish_workflow: {
        running: "Publishing a workflow on n8n",
        done: "Published a workflow on n8n",
      },
      unpublish_workflow: {
        running: "Unpublishing a workflow on n8n",
        done: "Unpublished a workflow on n8n",
      },
      create_workflow_from_code: {
        running: "Creating a workflow on n8n",
        done: "Created a workflow on n8n",
      },
      update_workflow: {
        running: "Updating a workflow on n8n",
        done: "Updated a workflow on n8n",
      },
      archive_workflow: {
        running: "Archiving a workflow on n8n",
        done: "Archived a workflow on n8n",
      },
      restore_workflow_version: {
        running: "Restoring a workflow version on n8n",
        done: "Restored a workflow version on n8n",
      },
      create_data_table: {
        running: "Creating a data table on n8n",
        done: "Created a data table on n8n",
      },
      rename_data_table: {
        running: "Renaming a data table on n8n",
        done: "Renamed a data table on n8n",
      },
      add_data_table_column: {
        running: "Adding a column on n8n",
        done: "Added a column on n8n",
      },
      delete_data_table_column: {
        running: "Deleting a column on n8n",
        done: "Deleted a column on n8n",
      },
      rename_data_table_column: {
        running: "Renaming a column on n8n",
        done: "Renamed a column on n8n",
      },
      add_data_table_rows: {
        running: "Adding rows on n8n",
        done: "Added rows on n8n",
      },
      create_folder: {
        running: "Creating a folder on n8n",
        done: "Created a folder on n8n",
      },
      update_folder: {
        running: "Updating a folder on n8n",
        done: "Updated a folder on n8n",
      },
      move_workflows_to_folder: {
        running: "Moving workflows on n8n",
        done: "Moved workflows on n8n",
      },
      install_community_node: {
        running: "Installing a community node on n8n",
        done: "Installed a community node on n8n",
      },
      create_agent: {
        running: "Creating an agent on n8n",
        done: "Created an agent on n8n",
      },
      mutate_agent: {
        running: "Updating an agent on n8n",
        done: "Updated an agent on n8n",
      },
      call_agent: {
        running: "Calling an agent on n8n",
        done: "Called an agent on n8n",
      },
      publish_agent: {
        running: "Publishing an agent on n8n",
        done: "Published an agent on n8n",
      },
      unpublish_agent: {
        running: "Unpublishing an agent on n8n",
        done: "Unpublished an agent on n8n",
      },
      revert_agent: {
        running: "Reverting an agent on n8n",
        done: "Reverted an agent on n8n",
      },
      delete_agent: {
        running: "Deleting an agent on n8n",
        done: "Deleted an agent on n8n",
      },
      verify_agent_mcp_server: {
        running: "Testing an MCP server on n8n",
        done: "Tested an MCP server on n8n",
      },
      update_agent_integration: {
        running: "Updating an agent integration on n8n",
        done: "Updated an agent integration on n8n",
      },
    },
  },
  {
    id: 10052,
    name: "Ahrefs",
    description:
      "Ahrefs tools to analyze backlinks, organic keywords, competitors, rankings, site audits, Search Console data and AI brand visibility.",
    url: "https://api.ahrefs.com/mcp/mcp",
    icon: "AhrefsLogo",
    documentationUrl: "https://docs.ahrefs.com/en/mcp/docs/introduction",
    connectionInstructions:
      "Ahrefs uses OAuth with dynamic client registration. Sign in with your Ahrefs account to connect. Requires a paid Ahrefs plan (Lite or higher). Tool calls consume API units from your Ahrefs monthly allowance.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      doc: "never_ask",
      "subscription-info-limits-and-usage": "never_ask",
      "management-projects": "never_ask",
      "management-project-keywords": "never_ask",
      "management-project-competitors": "never_ask",
      "management-keyword-list-keywords": "never_ask",
      "management-locations": "never_ask",
      "management-brand-radar-reports": "never_ask",
      "management-brand-radar-prompts": "never_ask",
      "public-domain-rating-free": "never_ask",
      "public-domain-rating-top-domains": "never_ask",
      "public-crawler-ips": "never_ask",
      "public-crawler-ip-ranges": "never_ask",
      "batch-analysis": "never_ask",
      "site-explorer-metrics": "never_ask",
      "site-explorer-metrics-history": "never_ask",
      "site-explorer-metrics-by-country": "never_ask",
      "site-explorer-domain-rating": "never_ask",
      "site-explorer-domain-rating-history": "never_ask",
      "site-explorer-url-rating-history": "never_ask",
      "site-explorer-backlinks-stats": "never_ask",
      "site-explorer-all-backlinks": "never_ask",
      "site-explorer-broken-backlinks": "never_ask",
      "site-explorer-referring-domains": "never_ask",
      "site-explorer-refdomains-history": "never_ask",
      "site-explorer-anchors": "never_ask",
      "site-explorer-linked-anchors-external": "never_ask",
      "site-explorer-linked-anchors-internal": "never_ask",
      "site-explorer-linked-domains": "never_ask",
      "site-explorer-outlinks-stats": "never_ask",
      "site-explorer-organic-keywords": "never_ask",
      "site-explorer-organic-competitors": "never_ask",
      "site-explorer-keywords-history": "never_ask",
      "site-explorer-total-search-volume-history": "never_ask",
      "site-explorer-top-pages": "never_ask",
      "site-explorer-paid-pages": "never_ask",
      "site-explorer-pages-by-backlinks": "never_ask",
      "site-explorer-pages-by-internal-links": "never_ask",
      "site-explorer-pages-by-traffic": "never_ask",
      "site-explorer-pages-history": "never_ask",
      "site-explorer-crawled-pages": "never_ask",
      "site-explorer-ai-responses-count": "never_ask",
      "keywords-explorer-overview": "never_ask",
      "keywords-explorer-volume-history": "never_ask",
      "keywords-explorer-volume-by-country": "never_ask",
      "keywords-explorer-matching-terms": "never_ask",
      "keywords-explorer-related-terms": "never_ask",
      "keywords-explorer-search-suggestions": "never_ask",
      "serp-overview": "never_ask",
      "content-helper-topics": "never_ask",
      "rank-tracker-overview": "never_ask",
      "rank-tracker-serp-overview": "never_ask",
      "rank-tracker-competitors-overview": "never_ask",
      "rank-tracker-competitors-domains": "never_ask",
      "rank-tracker-competitors-pages": "never_ask",
      "rank-tracker-competitors-stats": "never_ask",
      "site-audit-projects": "never_ask",
      "site-audit-issues": "never_ask",
      "site-audit-page-explorer": "never_ask",
      "site-audit-page-content": "never_ask",
      "gsc-keywords": "never_ask",
      "gsc-keyword-history": "never_ask",
      "gsc-pages": "never_ask",
      "gsc-page-history": "never_ask",
      "gsc-pages-history": "never_ask",
      "gsc-performance-history": "never_ask",
      "gsc-performance-by-device": "never_ask",
      "gsc-performance-by-position": "never_ask",
      "gsc-positions-history": "never_ask",
      "gsc-ctr-by-position": "never_ask",
      "gsc-metrics-by-country": "never_ask",
      "gsc-anonymous-queries": "never_ask",
      "brand-radar-ai-responses": "never_ask",
      "brand-radar-ai-responses-entities": "never_ask",
      "brand-radar-cited-domains": "never_ask",
      "brand-radar-cited-domains-entities": "never_ask",
      "brand-radar-cited-pages": "never_ask",
      "brand-radar-cited-pages-entities": "never_ask",
      "brand-radar-citations-overview-entities": "never_ask",
      "brand-radar-citations-history-entities": "never_ask",
      "brand-radar-impressions-overview": "never_ask",
      "brand-radar-impressions-overview-entities": "never_ask",
      "brand-radar-impressions-history": "never_ask",
      "brand-radar-impressions-history-entities": "never_ask",
      "brand-radar-mentions-overview": "never_ask",
      "brand-radar-mentions-overview-entities": "never_ask",
      "brand-radar-mentions-history": "never_ask",
      "brand-radar-mentions-history-entities": "never_ask",
      "brand-radar-sov-overview": "never_ask",
      "brand-radar-sov-overview-entities": "never_ask",
      "brand-radar-sov-history": "never_ask",
      "brand-radar-sov-history-entities": "never_ask",
      "web-analytics-stats": "never_ask",
      "web-analytics-chart": "never_ask",
      "web-analytics-top-pages": "never_ask",
      "web-analytics-top-pages-chart": "never_ask",
      "web-analytics-entry-pages": "never_ask",
      "web-analytics-entry-pages-chart": "never_ask",
      "web-analytics-exit-pages": "never_ask",
      "web-analytics-exit-pages-chart": "never_ask",
      "web-analytics-sources": "never_ask",
      "web-analytics-sources-chart": "never_ask",
      "web-analytics-source-channels": "never_ask",
      "web-analytics-source-channels-chart": "never_ask",
      "web-analytics-referrers": "never_ask",
      "web-analytics-referrers-chart": "never_ask",
      "web-analytics-utm-params": "never_ask",
      "web-analytics-utm-params-chart": "never_ask",
      "web-analytics-countries": "never_ask",
      "web-analytics-countries-chart": "never_ask",
      "web-analytics-cities": "never_ask",
      "web-analytics-cities-chart": "never_ask",
      "web-analytics-continents": "never_ask",
      "web-analytics-continents-chart": "never_ask",
      "web-analytics-languages": "never_ask",
      "web-analytics-languages-chart": "never_ask",
      "web-analytics-devices": "never_ask",
      "web-analytics-devices-chart": "never_ask",
      "web-analytics-browsers": "never_ask",
      "web-analytics-browsers-chart": "never_ask",
      "web-analytics-browser-versions": "never_ask",
      "web-analytics-browser-versions-chart": "never_ask",
      "web-analytics-operating-systems": "never_ask",
      "web-analytics-operating-systems-chart": "never_ask",
      "web-analytics-operating-systems-versions": "never_ask",
      "web-analytics-operating-systems-versions-chart": "never_ask",
      "social-media-channels": "never_ask",
      "social-media-channel-metrics": "never_ask",
      "social-media-posts": "never_ask",
      "social-media-post-metrics": "never_ask",
      "social-media-activity-history": "never_ask",
      "social-media-authors": "never_ask",
      "render-scorecard": "never_ask",
      "render-time-series-chart": "never_ask",
      "render-data-table": "never_ask",
    },
    toolDisplayLabels: {
      doc: {
        running: "Checking Ahrefs docs",
        done: "Checked Ahrefs docs",
      },
      "subscription-info-limits-and-usage": {
        running: "Fetching subscription usage from Ahrefs",
        done: "Fetched subscription usage from Ahrefs",
      },
      "management-projects": {
        running: "Fetching projects from Ahrefs",
        done: "Fetched projects from Ahrefs",
      },
      "management-project-keywords": {
        running: "Fetching project keywords from Ahrefs",
        done: "Fetched project keywords from Ahrefs",
      },
      "management-project-competitors": {
        running: "Fetching project competitors from Ahrefs",
        done: "Fetched project competitors from Ahrefs",
      },
      "management-keyword-list-keywords": {
        running: "Fetching keyword list keywords from Ahrefs",
        done: "Fetched keyword list keywords from Ahrefs",
      },
      "management-locations": {
        running: "Fetching locations from Ahrefs",
        done: "Fetched locations from Ahrefs",
      },
      "management-brand-radar-reports": {
        running: "Fetching Brand Radar reports from Ahrefs",
        done: "Fetched Brand Radar reports from Ahrefs",
      },
      "management-brand-radar-prompts": {
        running: "Fetching Brand Radar prompts from Ahrefs",
        done: "Fetched Brand Radar prompts from Ahrefs",
      },
      "public-domain-rating-free": {
        running: "Fetching domain rating from Ahrefs",
        done: "Fetched domain rating from Ahrefs",
      },
      "public-domain-rating-top-domains": {
        running: "Fetching top domains by rating from Ahrefs",
        done: "Fetched top domains by rating from Ahrefs",
      },
      "public-crawler-ips": {
        running: "Fetching crawler IPs from Ahrefs",
        done: "Fetched crawler IPs from Ahrefs",
      },
      "public-crawler-ip-ranges": {
        running: "Fetching crawler IP ranges from Ahrefs",
        done: "Fetched crawler IP ranges from Ahrefs",
      },
      "batch-analysis": {
        running: "Running a batch analysis on Ahrefs",
        done: "Ran a batch analysis on Ahrefs",
      },
      "site-explorer-metrics": {
        running: "Fetching site metrics from Ahrefs",
        done: "Fetched site metrics from Ahrefs",
      },
      "site-explorer-metrics-history": {
        running: "Fetching site metrics history from Ahrefs",
        done: "Fetched site metrics history from Ahrefs",
      },
      "site-explorer-metrics-by-country": {
        running: "Fetching site metrics by country from Ahrefs",
        done: "Fetched site metrics by country from Ahrefs",
      },
      "site-explorer-domain-rating": {
        running: "Fetching domain rating from Ahrefs",
        done: "Fetched domain rating from Ahrefs",
      },
      "site-explorer-domain-rating-history": {
        running: "Fetching domain rating history from Ahrefs",
        done: "Fetched domain rating history from Ahrefs",
      },
      "site-explorer-url-rating-history": {
        running: "Fetching URL rating history from Ahrefs",
        done: "Fetched URL rating history from Ahrefs",
      },
      "site-explorer-backlinks-stats": {
        running: "Fetching backlinks stats from Ahrefs",
        done: "Fetched backlinks stats from Ahrefs",
      },
      "site-explorer-all-backlinks": {
        running: "Fetching backlinks from Ahrefs",
        done: "Fetched backlinks from Ahrefs",
      },
      "site-explorer-broken-backlinks": {
        running: "Fetching broken backlinks from Ahrefs",
        done: "Fetched broken backlinks from Ahrefs",
      },
      "site-explorer-referring-domains": {
        running: "Fetching referring domains from Ahrefs",
        done: "Fetched referring domains from Ahrefs",
      },
      "site-explorer-refdomains-history": {
        running: "Fetching referring domains history from Ahrefs",
        done: "Fetched referring domains history from Ahrefs",
      },
      "site-explorer-anchors": {
        running: "Fetching anchors from Ahrefs",
        done: "Fetched anchors from Ahrefs",
      },
      "site-explorer-linked-anchors-external": {
        running: "Fetching external linked anchors from Ahrefs",
        done: "Fetched external linked anchors from Ahrefs",
      },
      "site-explorer-linked-anchors-internal": {
        running: "Fetching internal linked anchors from Ahrefs",
        done: "Fetched internal linked anchors from Ahrefs",
      },
      "site-explorer-linked-domains": {
        running: "Fetching linked domains from Ahrefs",
        done: "Fetched linked domains from Ahrefs",
      },
      "site-explorer-outlinks-stats": {
        running: "Fetching outlinks stats from Ahrefs",
        done: "Fetched outlinks stats from Ahrefs",
      },
      "site-explorer-organic-keywords": {
        running: "Fetching organic keywords from Ahrefs",
        done: "Fetched organic keywords from Ahrefs",
      },
      "site-explorer-organic-competitors": {
        running: "Fetching organic competitors from Ahrefs",
        done: "Fetched organic competitors from Ahrefs",
      },
      "site-explorer-keywords-history": {
        running: "Fetching keywords history from Ahrefs",
        done: "Fetched keywords history from Ahrefs",
      },
      "site-explorer-total-search-volume-history": {
        running: "Fetching search volume history from Ahrefs",
        done: "Fetched search volume history from Ahrefs",
      },
      "site-explorer-top-pages": {
        running: "Fetching top pages from Ahrefs",
        done: "Fetched top pages from Ahrefs",
      },
      "site-explorer-paid-pages": {
        running: "Fetching paid pages from Ahrefs",
        done: "Fetched paid pages from Ahrefs",
      },
      "site-explorer-pages-by-backlinks": {
        running: "Fetching pages by backlinks from Ahrefs",
        done: "Fetched pages by backlinks from Ahrefs",
      },
      "site-explorer-pages-by-internal-links": {
        running: "Fetching pages by internal links from Ahrefs",
        done: "Fetched pages by internal links from Ahrefs",
      },
      "site-explorer-pages-by-traffic": {
        running: "Fetching pages by traffic from Ahrefs",
        done: "Fetched pages by traffic from Ahrefs",
      },
      "site-explorer-pages-history": {
        running: "Fetching pages history from Ahrefs",
        done: "Fetched pages history from Ahrefs",
      },
      "site-explorer-crawled-pages": {
        running: "Fetching crawled pages from Ahrefs",
        done: "Fetched crawled pages from Ahrefs",
      },
      "site-explorer-ai-responses-count": {
        running: "Fetching AI citations count from Ahrefs",
        done: "Fetched AI citations count from Ahrefs",
      },
      "keywords-explorer-overview": {
        running: "Fetching keywords overview from Ahrefs",
        done: "Fetched keywords overview from Ahrefs",
      },
      "keywords-explorer-volume-history": {
        running: "Fetching keyword volume history from Ahrefs",
        done: "Fetched keyword volume history from Ahrefs",
      },
      "keywords-explorer-volume-by-country": {
        running: "Fetching keyword volume by country from Ahrefs",
        done: "Fetched keyword volume by country from Ahrefs",
      },
      "keywords-explorer-matching-terms": {
        running: "Fetching matching terms from Ahrefs",
        done: "Fetched matching terms from Ahrefs",
      },
      "keywords-explorer-related-terms": {
        running: "Fetching related terms from Ahrefs",
        done: "Fetched related terms from Ahrefs",
      },
      "keywords-explorer-search-suggestions": {
        running: "Fetching search suggestions from Ahrefs",
        done: "Fetched search suggestions from Ahrefs",
      },
      "serp-overview": {
        running: "Fetching SERP overview from Ahrefs",
        done: "Fetched SERP overview from Ahrefs",
      },
      "content-helper-topics": {
        running: "Analyzing content topics on Ahrefs",
        done: "Analyzed content topics on Ahrefs",
      },
      "rank-tracker-overview": {
        running: "Fetching Rank Tracker overview from Ahrefs",
        done: "Fetched Rank Tracker overview from Ahrefs",
      },
      "rank-tracker-serp-overview": {
        running: "Fetching Rank Tracker SERP overview from Ahrefs",
        done: "Fetched Rank Tracker SERP overview from Ahrefs",
      },
      "rank-tracker-competitors-overview": {
        running: "Fetching competitors overview from Ahrefs",
        done: "Fetched competitors overview from Ahrefs",
      },
      "rank-tracker-competitors-domains": {
        running: "Fetching competitor domains from Ahrefs",
        done: "Fetched competitor domains from Ahrefs",
      },
      "rank-tracker-competitors-pages": {
        running: "Fetching competitor pages from Ahrefs",
        done: "Fetched competitor pages from Ahrefs",
      },
      "rank-tracker-competitors-stats": {
        running: "Fetching competitor stats from Ahrefs",
        done: "Fetched competitor stats from Ahrefs",
      },
      "site-audit-projects": {
        running: "Fetching Site Audit projects from Ahrefs",
        done: "Fetched Site Audit projects from Ahrefs",
      },
      "site-audit-issues": {
        running: "Fetching Site Audit issues from Ahrefs",
        done: "Fetched Site Audit issues from Ahrefs",
      },
      "site-audit-page-explorer": {
        running: "Fetching Site Audit pages from Ahrefs",
        done: "Fetched Site Audit pages from Ahrefs",
      },
      "site-audit-page-content": {
        running: "Fetching Site Audit page content from Ahrefs",
        done: "Fetched Site Audit page content from Ahrefs",
      },
      "gsc-keywords": {
        running: "Fetching Search Console keywords from Ahrefs",
        done: "Fetched Search Console keywords from Ahrefs",
      },
      "gsc-keyword-history": {
        running: "Fetching Search Console keyword history from Ahrefs",
        done: "Fetched Search Console keyword history from Ahrefs",
      },
      "gsc-pages": {
        running: "Fetching Search Console pages from Ahrefs",
        done: "Fetched Search Console pages from Ahrefs",
      },
      "gsc-page-history": {
        running: "Fetching Search Console page history from Ahrefs",
        done: "Fetched Search Console page history from Ahrefs",
      },
      "gsc-pages-history": {
        running: "Fetching Search Console pages history from Ahrefs",
        done: "Fetched Search Console pages history from Ahrefs",
      },
      "gsc-performance-history": {
        running: "Fetching Search Console performance history from Ahrefs",
        done: "Fetched Search Console performance history from Ahrefs",
      },
      "gsc-performance-by-device": {
        running: "Fetching Search Console performance by device from Ahrefs",
        done: "Fetched Search Console performance by device from Ahrefs",
      },
      "gsc-performance-by-position": {
        running: "Fetching Search Console performance by position from Ahrefs",
        done: "Fetched Search Console performance by position from Ahrefs",
      },
      "gsc-positions-history": {
        running: "Fetching Search Console positions history from Ahrefs",
        done: "Fetched Search Console positions history from Ahrefs",
      },
      "gsc-ctr-by-position": {
        running: "Fetching Search Console CTR by position from Ahrefs",
        done: "Fetched Search Console CTR by position from Ahrefs",
      },
      "gsc-metrics-by-country": {
        running: "Fetching Search Console metrics by country from Ahrefs",
        done: "Fetched Search Console metrics by country from Ahrefs",
      },
      "gsc-anonymous-queries": {
        running: "Fetching Search Console anonymous queries from Ahrefs",
        done: "Fetched Search Console anonymous queries from Ahrefs",
      },
      "brand-radar-ai-responses": {
        running: "Fetching AI responses from Ahrefs",
        done: "Fetched AI responses from Ahrefs",
      },
      "brand-radar-ai-responses-entities": {
        running: "Fetching AI responses from Ahrefs",
        done: "Fetched AI responses from Ahrefs",
      },
      "brand-radar-cited-domains": {
        running: "Fetching cited domains from Ahrefs",
        done: "Fetched cited domains from Ahrefs",
      },
      "brand-radar-cited-domains-entities": {
        running: "Fetching cited domains from Ahrefs",
        done: "Fetched cited domains from Ahrefs",
      },
      "brand-radar-cited-pages": {
        running: "Fetching cited pages from Ahrefs",
        done: "Fetched cited pages from Ahrefs",
      },
      "brand-radar-cited-pages-entities": {
        running: "Fetching cited pages from Ahrefs",
        done: "Fetched cited pages from Ahrefs",
      },
      "brand-radar-citations-overview-entities": {
        running: "Fetching citations overview from Ahrefs",
        done: "Fetched citations overview from Ahrefs",
      },
      "brand-radar-citations-history-entities": {
        running: "Fetching citations history from Ahrefs",
        done: "Fetched citations history from Ahrefs",
      },
      "brand-radar-impressions-overview": {
        running: "Fetching impressions overview from Ahrefs",
        done: "Fetched impressions overview from Ahrefs",
      },
      "brand-radar-impressions-overview-entities": {
        running: "Fetching impressions overview from Ahrefs",
        done: "Fetched impressions overview from Ahrefs",
      },
      "brand-radar-impressions-history": {
        running: "Fetching impressions history from Ahrefs",
        done: "Fetched impressions history from Ahrefs",
      },
      "brand-radar-impressions-history-entities": {
        running: "Fetching impressions history from Ahrefs",
        done: "Fetched impressions history from Ahrefs",
      },
      "brand-radar-mentions-overview": {
        running: "Fetching mentions overview from Ahrefs",
        done: "Fetched mentions overview from Ahrefs",
      },
      "brand-radar-mentions-overview-entities": {
        running: "Fetching mentions overview from Ahrefs",
        done: "Fetched mentions overview from Ahrefs",
      },
      "brand-radar-mentions-history": {
        running: "Fetching mentions history from Ahrefs",
        done: "Fetched mentions history from Ahrefs",
      },
      "brand-radar-mentions-history-entities": {
        running: "Fetching mentions history from Ahrefs",
        done: "Fetched mentions history from Ahrefs",
      },
      "brand-radar-sov-overview": {
        running: "Fetching share of voice from Ahrefs",
        done: "Fetched share of voice from Ahrefs",
      },
      "brand-radar-sov-overview-entities": {
        running: "Fetching share of voice from Ahrefs",
        done: "Fetched share of voice from Ahrefs",
      },
      "brand-radar-sov-history": {
        running: "Fetching share of voice history from Ahrefs",
        done: "Fetched share of voice history from Ahrefs",
      },
      "brand-radar-sov-history-entities": {
        running: "Fetching share of voice history from Ahrefs",
        done: "Fetched share of voice history from Ahrefs",
      },
      "web-analytics-stats": {
        running: "Fetching web analytics stats from Ahrefs",
        done: "Fetched web analytics stats from Ahrefs",
      },
      "web-analytics-chart": {
        running: "Fetching web analytics chart from Ahrefs",
        done: "Fetched web analytics chart from Ahrefs",
      },
      "web-analytics-top-pages": {
        running: "Fetching top visited pages from Ahrefs",
        done: "Fetched top visited pages from Ahrefs",
      },
      "web-analytics-top-pages-chart": {
        running: "Fetching top visited pages chart from Ahrefs",
        done: "Fetched top visited pages chart from Ahrefs",
      },
      "web-analytics-entry-pages": {
        running: "Fetching entry pages from Ahrefs",
        done: "Fetched entry pages from Ahrefs",
      },
      "web-analytics-entry-pages-chart": {
        running: "Fetching entry pages chart from Ahrefs",
        done: "Fetched entry pages chart from Ahrefs",
      },
      "web-analytics-exit-pages": {
        running: "Fetching exit pages from Ahrefs",
        done: "Fetched exit pages from Ahrefs",
      },
      "web-analytics-exit-pages-chart": {
        running: "Fetching exit pages chart from Ahrefs",
        done: "Fetched exit pages chart from Ahrefs",
      },
      "web-analytics-sources": {
        running: "Fetching traffic sources from Ahrefs",
        done: "Fetched traffic sources from Ahrefs",
      },
      "web-analytics-sources-chart": {
        running: "Fetching traffic sources chart from Ahrefs",
        done: "Fetched traffic sources chart from Ahrefs",
      },
      "web-analytics-source-channels": {
        running: "Fetching source channels from Ahrefs",
        done: "Fetched source channels from Ahrefs",
      },
      "web-analytics-source-channels-chart": {
        running: "Fetching source channels chart from Ahrefs",
        done: "Fetched source channels chart from Ahrefs",
      },
      "web-analytics-referrers": {
        running: "Fetching referrers from Ahrefs",
        done: "Fetched referrers from Ahrefs",
      },
      "web-analytics-referrers-chart": {
        running: "Fetching referrers chart from Ahrefs",
        done: "Fetched referrers chart from Ahrefs",
      },
      "web-analytics-utm-params": {
        running: "Fetching UTM params from Ahrefs",
        done: "Fetched UTM params from Ahrefs",
      },
      "web-analytics-utm-params-chart": {
        running: "Fetching UTM params chart from Ahrefs",
        done: "Fetched UTM params chart from Ahrefs",
      },
      "web-analytics-countries": {
        running: "Fetching visitor countries from Ahrefs",
        done: "Fetched visitor countries from Ahrefs",
      },
      "web-analytics-countries-chart": {
        running: "Fetching visitor countries chart from Ahrefs",
        done: "Fetched visitor countries chart from Ahrefs",
      },
      "web-analytics-cities": {
        running: "Fetching visitor cities from Ahrefs",
        done: "Fetched visitor cities from Ahrefs",
      },
      "web-analytics-cities-chart": {
        running: "Fetching visitor cities chart from Ahrefs",
        done: "Fetched visitor cities chart from Ahrefs",
      },
      "web-analytics-continents": {
        running: "Fetching visitor continents from Ahrefs",
        done: "Fetched visitor continents from Ahrefs",
      },
      "web-analytics-continents-chart": {
        running: "Fetching visitor continents chart from Ahrefs",
        done: "Fetched visitor continents chart from Ahrefs",
      },
      "web-analytics-languages": {
        running: "Fetching visitor languages from Ahrefs",
        done: "Fetched visitor languages from Ahrefs",
      },
      "web-analytics-languages-chart": {
        running: "Fetching visitor languages chart from Ahrefs",
        done: "Fetched visitor languages chart from Ahrefs",
      },
      "web-analytics-devices": {
        running: "Fetching visitor devices from Ahrefs",
        done: "Fetched visitor devices from Ahrefs",
      },
      "web-analytics-devices-chart": {
        running: "Fetching visitor devices chart from Ahrefs",
        done: "Fetched visitor devices chart from Ahrefs",
      },
      "web-analytics-browsers": {
        running: "Fetching visitor browsers from Ahrefs",
        done: "Fetched visitor browsers from Ahrefs",
      },
      "web-analytics-browsers-chart": {
        running: "Fetching visitor browsers chart from Ahrefs",
        done: "Fetched visitor browsers chart from Ahrefs",
      },
      "web-analytics-browser-versions": {
        running: "Fetching browser versions from Ahrefs",
        done: "Fetched browser versions from Ahrefs",
      },
      "web-analytics-browser-versions-chart": {
        running: "Fetching browser versions chart from Ahrefs",
        done: "Fetched browser versions chart from Ahrefs",
      },
      "web-analytics-operating-systems": {
        running: "Fetching operating systems from Ahrefs",
        done: "Fetched operating systems from Ahrefs",
      },
      "web-analytics-operating-systems-chart": {
        running: "Fetching operating systems chart from Ahrefs",
        done: "Fetched operating systems chart from Ahrefs",
      },
      "web-analytics-operating-systems-versions": {
        running: "Fetching OS versions from Ahrefs",
        done: "Fetched OS versions from Ahrefs",
      },
      "web-analytics-operating-systems-versions-chart": {
        running: "Fetching OS versions chart from Ahrefs",
        done: "Fetched OS versions chart from Ahrefs",
      },
      "social-media-channels": {
        running: "Fetching social media channels from Ahrefs",
        done: "Fetched social media channels from Ahrefs",
      },
      "social-media-channel-metrics": {
        running: "Fetching channel metrics from Ahrefs",
        done: "Fetched channel metrics from Ahrefs",
      },
      "social-media-posts": {
        running: "Fetching social media posts from Ahrefs",
        done: "Fetched social media posts from Ahrefs",
      },
      "social-media-post-metrics": {
        running: "Fetching post metrics from Ahrefs",
        done: "Fetched post metrics from Ahrefs",
      },
      "social-media-activity-history": {
        running: "Fetching post activity history from Ahrefs",
        done: "Fetched post activity history from Ahrefs",
      },
      "social-media-authors": {
        running: "Fetching post authors from Ahrefs",
        done: "Fetched post authors from Ahrefs",
      },
      "render-scorecard": {
        running: "Rendering a scorecard with Ahrefs",
        done: "Rendered a scorecard with Ahrefs",
      },
      "render-time-series-chart": {
        running: "Rendering a chart with Ahrefs",
        done: "Rendered a chart with Ahrefs",
      },
      "render-data-table": {
        running: "Rendering a table with Ahrefs",
        done: "Rendered a table with Ahrefs",
      },
    },
  },
  {
    id: 10053,
    name: "Webflow",
    description:
      "Webflow tools to build and edit pages, elements, styles and components, manage CMS collections, assets and forms, read site analytics, and publish sites.",
    url: "https://mcp.webflow.com/mcp",
    icon: "WebflowLogo",
    documentationUrl: "https://developers.webflow.com/mcp/reference/overview",
    connectionInstructions:
      "Webflow uses OAuth with dynamic client registration. Sign in with your Webflow account to connect. Each connection grants access to a single Webflow workspace. Some tools require specific plans or add-ons: Enterprise for page branches and redirects, Webflow Analyze for analytics.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      ask_webflow_ai: "never_ask",
      webflow_guide_tool: "never_ask",
      get_more_tools: "never_ask",
      data_analyze_tool: "never_ask",
      get_asset_preview: "never_ask",
      element_snapshot_tool: "never_ask",
      data_sites_tool: "high",
      data_pages_tool: "high",
      data_cms_tool: "high",
      data_localization_tool: "high",
      data_scripts_tool: "high",
      data_comments_tool: "high",
      data_enterprise_tool: "high",
      data_forms_tool: "high",
      data_fonts_tool: "high",
      data_webhook_tool: "high",
      data_sitemap_tool: "high",
      data_assets_tool: "high",
      asset_tool: "high",
      data_style_tool: "high",
      data_variable_tool: "high",
      data_component_tool: "high",
      data_component_props_tool: "high",
      data_component_variants_tool: "high",
      data_interactions_tool: "high",
      data_element_tool: "high",
      data_element_settings_tool: "high",
      data_element_builder: "high",
      data_whtml_builder: "high",
      data_component_builder: "high",
      data_agent_instructions_tool: "high",
      data_apps_tool: "high",
      data_campaigns_tool: "high",
      designer_tool: "high",
    },
    toolDisplayLabels: {
      ask_webflow_ai: {
        running: "Asking Webflow AI",
        done: "Asked Webflow AI",
      },
      webflow_guide_tool: {
        running: "Reading the Webflow guide",
        done: "Read the Webflow guide",
      },
      get_more_tools: {
        running: "Looking for more Webflow tools",
        done: "Looked for more Webflow tools",
      },
      data_analyze_tool: {
        running: "Fetching analytics from Webflow",
        done: "Fetched analytics from Webflow",
      },
      get_asset_preview: {
        running: "Fetching an asset preview from Webflow",
        done: "Fetched an asset preview from Webflow",
      },
      element_snapshot_tool: {
        running: "Taking an element snapshot on Webflow",
        done: "Took an element snapshot on Webflow",
      },
      data_sites_tool: {
        running: "Managing sites on Webflow",
        done: "Managed sites on Webflow",
      },
      data_pages_tool: {
        running: "Managing pages on Webflow",
        done: "Managed pages on Webflow",
      },
      data_cms_tool: {
        running: "Managing CMS content on Webflow",
        done: "Managed CMS content on Webflow",
      },
      data_localization_tool: {
        running: "Managing localized content on Webflow",
        done: "Managed localized content on Webflow",
      },
      data_scripts_tool: {
        running: "Managing custom code on Webflow",
        done: "Managed custom code on Webflow",
      },
      data_comments_tool: {
        running: "Managing comments on Webflow",
        done: "Managed comments on Webflow",
      },
      data_enterprise_tool: {
        running: "Managing site settings on Webflow",
        done: "Managed site settings on Webflow",
      },
      data_forms_tool: {
        running: "Managing forms on Webflow",
        done: "Managed forms on Webflow",
      },
      data_fonts_tool: {
        running: "Managing fonts on Webflow",
        done: "Managed fonts on Webflow",
      },
      data_webhook_tool: {
        running: "Managing webhooks on Webflow",
        done: "Managed webhooks on Webflow",
      },
      data_sitemap_tool: {
        running: "Managing the sitemap on Webflow",
        done: "Managed the sitemap on Webflow",
      },
      data_assets_tool: {
        running: "Managing assets on Webflow",
        done: "Managed assets on Webflow",
      },
      asset_tool: {
        running: "Uploading an asset to Webflow",
        done: "Uploaded an asset to Webflow",
      },
      data_style_tool: {
        running: "Managing styles on Webflow",
        done: "Managed styles on Webflow",
      },
      data_variable_tool: {
        running: "Managing variables on Webflow",
        done: "Managed variables on Webflow",
      },
      data_component_tool: {
        running: "Managing components on Webflow",
        done: "Managed components on Webflow",
      },
      data_component_props_tool: {
        running: "Managing component props on Webflow",
        done: "Managed component props on Webflow",
      },
      data_component_variants_tool: {
        running: "Managing component variants on Webflow",
        done: "Managed component variants on Webflow",
      },
      data_interactions_tool: {
        running: "Managing interactions on Webflow",
        done: "Managed interactions on Webflow",
      },
      data_element_tool: {
        running: "Editing elements on Webflow",
        done: "Edited elements on Webflow",
      },
      data_element_settings_tool: {
        running: "Managing element settings on Webflow",
        done: "Managed element settings on Webflow",
      },
      data_element_builder: {
        running: "Building elements on Webflow",
        done: "Built elements on Webflow",
      },
      data_whtml_builder: {
        running: "Inserting HTML on Webflow",
        done: "Inserted HTML on Webflow",
      },
      data_component_builder: {
        running: "Inserting components on Webflow",
        done: "Inserted components on Webflow",
      },
      data_agent_instructions_tool: {
        running: "Managing agent instructions on Webflow",
        done: "Managed agent instructions on Webflow",
      },
      data_apps_tool: {
        running: "Managing Webflow Cloud apps",
        done: "Managed Webflow Cloud apps",
      },
      data_campaigns_tool: {
        running: "Managing campaigns on Webflow",
        done: "Managed campaigns on Webflow",
      },
      designer_tool: {
        running: "Using the Webflow Designer",
        done: "Used the Webflow Designer",
      },
    },
  },
  {
    id: 10054,
    name: "Bright Data",
    description:
      "Bright Data tools to search the web, scrape any webpage (even behind bot detection or CAPTCHA), and run pre-built scrapers for 1,200+ sites.",
    url: "https://mcp.brightdata.com/mcp",
    icon: "BrightDataLogo",
    documentationUrl:
      "https://docs.brightdata.com/products/mcp-server/overview",
    connectionInstructions:
      "Bright Data uses OAuth with dynamic client registration. Sign in with your Bright Data account to connect. Requests consume credits from your Bright Data account (5,000 free requests per month, shared across the account), and scraper runs are billed per record.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      ask_brightdata_assistant: "never_ask",
      search_engine: "never_ask",
      search_engine_batch: "never_ask",
      scrape_as_markdown: "never_ask",
      scrape_batch: "never_ask",
      search_scrapers: "never_ask",
      get_scraper_details: "never_ask",
      get_scraper_progress: "never_ask",
      get_scraper_results: "never_ask",
      run_scraper: "high",
      refresh_scrapers: "high",
    },
    toolDisplayLabels: {
      ask_brightdata_assistant: {
        running: "Asking the Bright Data assistant",
        done: "Asked the Bright Data assistant",
      },
      search_engine: {
        running: "Searching the web with Bright Data",
        done: "Searched the web with Bright Data",
      },
      search_engine_batch: {
        running: "Running searches with Bright Data",
        done: "Ran searches with Bright Data",
      },
      scrape_as_markdown: {
        running: "Scraping a webpage with Bright Data",
        done: "Scraped a webpage with Bright Data",
      },
      scrape_batch: {
        running: "Scraping webpages with Bright Data",
        done: "Scraped webpages with Bright Data",
      },
      search_scrapers: {
        running: "Searching scrapers on Bright Data",
        done: "Searched scrapers on Bright Data",
      },
      get_scraper_details: {
        running: "Fetching scraper details from Bright Data",
        done: "Fetched scraper details from Bright Data",
      },
      get_scraper_progress: {
        running: "Checking scraper progress on Bright Data",
        done: "Checked scraper progress on Bright Data",
      },
      get_scraper_results: {
        running: "Fetching scraper results from Bright Data",
        done: "Fetched scraper results from Bright Data",
      },
      run_scraper: {
        running: "Running a scraper on Bright Data",
        done: "Ran a scraper on Bright Data",
      },
      refresh_scrapers: {
        running: "Refreshing scrapers on Bright Data",
        done: "Refreshed scrapers on Bright Data",
      },
    },
  },
  {
    id: 10055,
    name: "Swarmia",
    description:
      "Swarmia tools to query engineering metrics (DORA, PR cycle time, code and issue metrics), AI tool adoption and impact, key metrics, and saved Explore views.",
    url: "https://app.swarmia.com/api/v1/mcp",
    icon: "SwarmiaLogo",
    documentationUrl:
      "https://help.swarmia.com/settings/integrations/mcp-server",
    connectionInstructions:
      "Swarmia uses OAuth with dynamic client registration. Sign in with your Swarmia account to connect.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      EntityQuery: "never_ask",
      EntityReport: "never_ask",
      DiscoverEntitySchema: "never_ask",
      ListKeyMetrics: "never_ask",
      EvaluateKeyMetric: "never_ask",
      ListSavedExploreViews: "never_ask",
      ExecuteSavedExploreView: "never_ask",
      InvestmentCategoryQuery: "never_ask",
      GetGHAWorkflowData: "never_ask",
      GetSwarmiaKnowledge: "never_ask",
      BuildAppLink: "never_ask",
    },
    toolDisplayLabels: {
      EntityQuery: {
        running: "Querying data on Swarmia",
        done: "Queried data on Swarmia",
      },
      EntityReport: {
        running: "Running a report on Swarmia",
        done: "Ran a report on Swarmia",
      },
      DiscoverEntitySchema: {
        running: "Exploring the data model on Swarmia",
        done: "Explored the data model on Swarmia",
      },
      ListKeyMetrics: {
        running: "Listing key metrics on Swarmia",
        done: "Listed key metrics on Swarmia",
      },
      EvaluateKeyMetric: {
        running: "Calculating a key metric on Swarmia",
        done: "Calculated a key metric on Swarmia",
      },
      ListSavedExploreViews: {
        running: "Listing saved views on Swarmia",
        done: "Listed saved views on Swarmia",
      },
      ExecuteSavedExploreView: {
        running: "Running a saved view on Swarmia",
        done: "Ran a saved view on Swarmia",
      },
      InvestmentCategoryQuery: {
        running: "Fetching investment categories from Swarmia",
        done: "Fetched investment categories from Swarmia",
      },
      GetGHAWorkflowData: {
        running: "Fetching a GitHub Actions workflow from Swarmia",
        done: "Fetched a GitHub Actions workflow from Swarmia",
      },
      GetSwarmiaKnowledge: {
        running: "Searching the Swarmia docs",
        done: "Searched the Swarmia docs",
      },
      BuildAppLink: {
        running: "Building a Swarmia link",
        done: "Built a Swarmia link",
      },
    },
  },
  {
    ...CONTENTFUL_SHARED_CONFIG,
    id: 10056,
    name: "Contentful",
    description:
      "Contentful tools for searching, creating, updating and publishing entries, assets, content types, releases, locales and taxonomies (Region: Global).",
    url: "https://mcp.contentful.com/mcp",
    connectionInstructions:
      "Contentful uses OAuth with dynamic client registration. A space admin must first install the Contentful MCP app in each space and environment you want to use, and choose which tools it allows there. When you sign in, pick the spaces and environments to give Dust access to. Use this server if your organization is hosted on app.contentful.com.",
  },
  {
    ...CONTENTFUL_SHARED_CONFIG,
    id: 10057,
    name: "Contentful (Europe)",
    description:
      "Contentful tools for searching, creating, updating and publishing entries, assets, content types, releases, locales and taxonomies (Region: EU).",
    url: "https://mcp.eu.contentful.com/mcp",
    connectionInstructions:
      "Contentful uses OAuth with dynamic client registration. A space admin must first install the Contentful MCP app in each space and environment you want to use, and choose which tools it allows there. When you sign in, pick the spaces and environments to give Dust access to. Use this server if your organization is hosted on app.eu.contentful.com.",
  },
  {
    id: 10058,
    name: "Fireflies",
    description:
      "Fireflies tools to search meeting transcripts and summaries, read meeting analytics, and manage meeting sharing, privacy, channels and soundbites.",
    url: "https://api.fireflies.ai/mcp",
    icon: "FirefliesLogo",
    documentationUrl:
      "https://docs.fireflies.ai/getting-started/mcp-configuration",
    connectionInstructions:
      "Fireflies uses OAuth with dynamic client registration. Sign in with your Fireflies account to connect.",
    authMethod: "oauth-dynamic",
    toolStakes: {
      fireflies_search: "never_ask",
      fireflies_fetch: "never_ask",
      fireflies_get_transcript: "never_ask",
      fireflies_get_transcripts: "never_ask",
      fireflies_get_summary: "never_ask",
      fireflies_get_active_meetings: "never_ask",
      fireflies_get_analytics: "never_ask",
      fireflies_list_channels: "never_ask",
      fireflies_get_channel: "never_ask",
      fireflies_get_soundbites: "never_ask",
      fireflies_get_user: "never_ask",
      fireflies_get_usergroups: "never_ask",
      fireflies_get_user_contacts: "never_ask",
      fireflies_get_rule_executions: "never_ask",
      fireflies_share_meeting: "high",
      fireflies_revoke_meeting_access: "high",
      fireflies_update_meeting_privacy: "high",
      fireflies_update_meeting_title: "high",
      fireflies_move_meeting: "high",
      fireflies_create_soundbite: "high",
    },
    toolDisplayLabels: {
      fireflies_search: {
        running: "Searching meetings on Fireflies",
        done: "Searched meetings on Fireflies",
      },
      fireflies_fetch: {
        running: "Fetching a meeting from Fireflies",
        done: "Fetched a meeting from Fireflies",
      },
      fireflies_get_transcript: {
        running: "Fetching a transcript from Fireflies",
        done: "Fetched a transcript from Fireflies",
      },
      fireflies_get_transcripts: {
        running: "Fetching transcripts from Fireflies",
        done: "Fetched transcripts from Fireflies",
      },
      fireflies_get_summary: {
        running: "Fetching a meeting summary from Fireflies",
        done: "Fetched a meeting summary from Fireflies",
      },
      fireflies_get_active_meetings: {
        running: "Fetching active meetings from Fireflies",
        done: "Fetched active meetings from Fireflies",
      },
      fireflies_get_analytics: {
        running: "Fetching analytics from Fireflies",
        done: "Fetched analytics from Fireflies",
      },
      fireflies_list_channels: {
        running: "Listing channels on Fireflies",
        done: "Listed channels on Fireflies",
      },
      fireflies_get_channel: {
        running: "Fetching a channel from Fireflies",
        done: "Fetched a channel from Fireflies",
      },
      fireflies_get_soundbites: {
        running: "Fetching soundbites from Fireflies",
        done: "Fetched soundbites from Fireflies",
      },
      fireflies_get_user: {
        running: "Fetching user details from Fireflies",
        done: "Fetched user details from Fireflies",
      },
      fireflies_get_usergroups: {
        running: "Fetching user groups from Fireflies",
        done: "Fetched user groups from Fireflies",
      },
      fireflies_get_user_contacts: {
        running: "Fetching contacts from Fireflies",
        done: "Fetched contacts from Fireflies",
      },
      fireflies_get_rule_executions: {
        running: "Fetching rule executions from Fireflies",
        done: "Fetched rule executions from Fireflies",
      },
      fireflies_share_meeting: {
        running: "Sharing a meeting on Fireflies",
        done: "Shared a meeting on Fireflies",
      },
      fireflies_revoke_meeting_access: {
        running: "Revoking meeting access on Fireflies",
        done: "Revoked meeting access on Fireflies",
      },
      fireflies_update_meeting_privacy: {
        running: "Updating meeting privacy on Fireflies",
        done: "Updated meeting privacy on Fireflies",
      },
      fireflies_update_meeting_title: {
        running: "Renaming a meeting on Fireflies",
        done: "Renamed a meeting on Fireflies",
      },
      fireflies_move_meeting: {
        running: "Moving meetings on Fireflies",
        done: "Moved meetings on Fireflies",
      },
      fireflies_create_soundbite: {
        running: "Creating a soundbite on Fireflies",
        done: "Created a soundbite on Fireflies",
      },
    },
  },
];

export const getDefaultRemoteMCPServerByURL = (
  url: string | null | undefined
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
