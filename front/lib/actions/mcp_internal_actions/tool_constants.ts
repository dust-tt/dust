import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/server_constants";

/**
 * Tool label configuration.
 * Can be either:
 * - A string (legacy format, used as running label, display name derived from tool name)
 * - An object with displayName and runningLabel
 */
type ToolLabelConfig =
  | string
  | {
      displayName: string;
      runningLabel: string;
    };

/**
 * Maps internal MCP server names to their tools' labels.
 * Each tool has:
 * - displayName: The name shown in the details sidebar when not running
 * - runningLabel: The label shown while the tool is executing
 */
export const INTERNAL_MCP_TOOLS_LABELS = {
  github: {
    create_issue: {
      displayName: "Create GitHub Issue",
      runningLabel: "Creating GitHub issue...",
    },
    comment_on_issue: {
      displayName: "Add Comment to Issue",
      runningLabel: "Adding comment to issue...",
    },
    add_issue_to_project: {
      displayName: "Add Issue to Project",
      runningLabel: "Adding issue to project...",
    },
    get_pull_request: {
      displayName: "Get Pull Request",
      runningLabel: "Fetching pull request...",
    },
    create_pull_request_review: {
      displayName: "Create Pull Request Review",
      runningLabel: "Creating pull request review...",
    },
    list_organization_projects: {
      displayName: "List Organization Projects",
      runningLabel: "Listing organization projects...",
    },
    list_issues: {
      displayName: "List Issues",
      runningLabel: "Listing issues...",
    },
    list_pull_requests: {
      displayName: "List Pull Requests",
      runningLabel: "Listing pull requests...",
    },
    get_issue: {
      displayName: "Get Issue Details",
      runningLabel: "Fetching issue details...",
    },
  },
  image_generation: {
    generate_image: {
      displayName: "Generate Image",
      runningLabel: "Generating image...",
    },
  },
  file_generation: {
    generate_file: {
      displayName: "Generate File",
      runningLabel: "Generating file...",
    },
    get_supported_source_formats_for_output_format: {
      displayName: "Get Supported Formats",
      runningLabel: "Fetching supported formats...",
    },
    convert_file_format: {
      displayName: "Convert File Format",
      runningLabel: "Converting file...",
    },
  },
  hubspot: {
    get_object_properties: {
      displayName: "Get Object Properties",
      runningLabel: "Fetching object properties...",
    },
    get_object_by_email: {
      displayName: "Get Object by Email",
      runningLabel: "Fetching object by email...",
    },
    get_latest_objects: {
      displayName: "Get Latest Objects",
      runningLabel: "Fetching latest objects...",
    },
    get_contact: "Fetching contact...",
    get_company: "Fetching company...",
    get_deal: "Fetching deal...",
    get_meeting: "Fetching meeting...",
    get_file_public_url: "Getting file URL...",
    get_associated_meetings: "Fetching associated meetings...",
    get_hubspot_link: "Fetching HubSpot link...",
    get_hubspot_portal_id: "Fetching portal ID...",
    list_owners: "Listing owners...",
    search_owners: "Searching owners...",
    get_current_user_id: "Fetching current user...",
    get_user_activity: "Fetching user activity...",
    list_associations: "Listing associations...",
    count_objects_by_properties: "Counting objects...",
    search_crm_objects: "Searching CRM objects...",
    export_crm_objects_csv: "Exporting objects to CSV...",
    create_contact: "Creating contact...",
    create_company: "Creating company...",
    create_deal: "Creating deal...",
    create_lead: "Creating lead...",
    create_task: "Creating task...",
    create_note: "Creating note...",
    create_communication: "Creating communication...",
    create_meeting: "Creating meeting...",
    create_association: "Creating association...",
    update_contact: "Updating contact...",
    update_company: "Updating company...",
    update_deal: "Updating deal...",
    remove_association: "Removing association...",
  },
  agent_router: {
    list_all_published_agents: "Finding agents...",
    suggest_agents_for_content: "Suggesting agents...",
  },
  include_data: {
    retrieve_recent_documents: "Loading recent documents...",
  },
  run_dust_app: {
    run_dust_app: "Running Dust app...",
  },
  notion: {
    search: "Searching Notion...",
    retrieve_page: "Fetching page...",
    retrieve_database_schema: "Fetching database schema...",
    retrieve_database_content: "Fetching database content...",
    query_database: "Querying database...",
    retrieve_block: "Fetching block...",
    retrieve_block_children: "Fetching block children...",
    fetch_comments: "Fetching comments...",
    list_users: "Listing users...",
    get_about_user: "Fetching user info...",
    create_page: "Creating page...",
    insert_row_into_database: "Inserting database row...",
    create_database: "Creating database...",
    update_page: "Updating page...",
    add_page_content: "Adding page content...",
    create_comment: "Creating comment...",
    delete_block: "Deleting block...",
    update_row_database: "Updating database row...",
    update_schema_database: "Updating database schema...",
  },
  extract_data: {
    extract_information_from_documents: "Extracting data from documents...",
  },
  missing_action_catcher: {
    catch_missing_action: "Processing action...",
  },
  salesforce: {
    execute_read_query: "Querying Salesforce...",
    list_objects: "Listing Salesforce objects...",
    describe_object: "Describing object...",
    list_attachments: "Listing attachments...",
    read_attachment: "Reading attachment...",
    update_object: "Updating Salesforce object...",
  },
  gmail: {
    get_drafts: "Fetching email drafts...",
    create_draft: "Creating email draft...",
    get_messages: "Fetching emails...",
    delete_draft: "Deleting draft...",
    create_reply_draft: "Creating reply draft...",
  },
  google_calendar: {
    list_calendars: "Listing calendars...",
    list_events: "Listing events...",
    get_event: "Fetching event...",
    create_event: "Creating event...",
    update_event: "Updating event...",
    delete_event: "Deleting event...",
    check_availability: "Checking availability...",
    get_user_timezones: "Fetching timezones...",
  },
  conversation_files: {
    list_files: "Listing conversation files...",
    cat: "Reading file...",
  },
  slack: {
    search_messages: "Searching Slack messages...",
    semantic_search_messages: "Searching Slack messages...",
    list_users: "Listing Slack users...",
    list_public_channels: "Listing Slack channels...",
    list_threads: "Listing message threads...",
    post_message: "Posting Slack message...",
    get_user: "Fetching Slack user...",
  },
  google_sheets: {
    list_spreadsheets: "Listing spreadsheets...",
    get_spreadsheet: "Fetching spreadsheet...",
    get_worksheet: "Fetching worksheet...",
    update_cells: "Updating cells...",
    append_data: "Adding data...",
    clear_range: "Clearing range...",
    create_spreadsheet: "Creating spreadsheet...",
    add_worksheet: "Adding worksheet...",
    delete_worksheet: "Deleting worksheet...",
    format_cells: "Formatting cells...",
    copy_sheet: "Copying sheet...",
    rename_worksheet: "Renaming worksheet...",
    move_worksheet: "Moving worksheet...",
  },
  monday: {
    get_boards: "Fetching boards...",
    get_board_items: "Fetching board items...",
    get_item_details: "Fetching item details...",
    search_items: "Searching items...",
    get_items_by_column_value: "Fetching items by column...",
    find_user_by_name: "Finding user...",
    get_board_values: "Fetching board values...",
    get_column_values: "Fetching column values...",
    get_file_column_values: "Fetching file columns...",
    get_group_details: "Fetching group details...",
    get_subitem_values: "Fetching subitem values...",
    get_user_details: "Fetching user details...",
    create_item: "Creating item...",
    update_item: "Updating item...",
    update_item_name: "Updating item name...",
    create_update: "Creating update...",
    create_board: "Creating board...",
    create_column: "Creating column...",
    create_group: "Creating group...",
    create_subitem: "Creating subitem...",
    update_subitem: "Updating subitem...",
    duplicate_group: "Duplicating group...",
    upload_file_to_column: "Uploading file...",
    delete_item: "Deleting item...",
    delete_group: "Deleting group...",
    move_item_to_board: "Moving item to board...",
    create_multiple_items: "Creating multiple items...",
    get_activity_logs: "Fetching activity logs...",
    get_board_analytics: "Fetching board analytics...",
  },
  agent_memory: {
    memory_not_available: "Memory not available...",
    retrieve: "Retrieving memory...",
    record_entries: "Recording entries...",
    erase_entries: "Erasing entries...",
    edit_entries: "Editing entries...",
  },
  jira: {
    get_issue: "Fetching Jira issue...",
    get_projects: "Fetching projects...",
    get_project: "Fetching project...",
    get_project_versions: "Fetching project versions...",
    get_transitions: "Fetching transitions...",
    get_issues: "Fetching issues...",
    get_issues_using_jql: "Querying Jira...",
    get_issue_types: "Fetching issue types...",
    get_issue_create_fields: "Fetching create fields...",
    get_issue_read_fields: "Fetching read fields...",
    get_connection_info: "Fetching connection info...",
    get_issue_link_types: "Fetching link types...",
    get_users: "Fetching users...",
    get_attachments: "Fetching attachments...",
    read_attachment: "Reading attachment...",
    create_comment: "Creating comment...",
    transition_issue: "Transitioning issue...",
    create_issue: "Creating Jira issue...",
    update_issue: "Updating issue...",
    create_issue_link: "Creating issue link...",
    delete_issue_link: "Deleting issue link...",
    upload_attachment: "Uploading attachment...",
  },
  interactive_content: {
    create_interactive_content_file: "Creating interactive file...",
    edit_interactive_content_file: "Editing interactive file...",
    retrieve_interactive_content_file: "Retrieving interactive file...",
    revert_interactive_content_file: "Reverting interactive file...",
    rename_interactive_content_file: "Renaming interactive file...",
    get_interactive_content_file_share_url: "Getting share URL...",
  },
  outlook: {
    get_messages: "Fetching emails...",
    get_drafts: "Fetching email drafts...",
    create_draft: "Creating email draft...",
    delete_draft: "Deleting draft...",
    create_reply_draft: "Creating reply draft...",
    get_contacts: "Fetching contacts...",
    create_contact: "Creating contact...",
    update_contact: "Updating contact...",
  },
  outlook_calendar: {
    get_user_timezone: "Fetching timezone...",
    list_calendars: "Listing calendars...",
    list_events: "Listing events...",
    get_event: "Fetching event...",
    create_event: "Creating event...",
    update_event: "Updating event...",
    delete_event: "Deleting event...",
    check_availability: "Checking availability...",
  },
  freshservice: {
    list_tickets: "Listing tickets...",
    get_ticket: "Fetching ticket...",
    get_ticket_read_fields: "Fetching ticket fields...",
    get_ticket_write_fields: "Fetching ticket fields...",
    list_departments: "Listing departments...",
    list_products: "Listing products...",
    list_oncall_schedules: "Listing on-call schedules...",
    list_service_categories: "Listing service categories...",
    list_service_items: "Listing service items...",
    search_service_items: "Searching service items...",
    get_service_item: "Fetching service item...",
    get_service_item_fields: "Fetching service item fields...",
    list_solution_categories: "Listing solution categories...",
    list_solution_folders: "Listing solution folders...",
    list_solution_articles: "Listing solution articles...",
    list_requesters: "Listing requesters...",
    get_requester: "Fetching requester...",
    list_purchase_orders: "Listing purchase orders...",
    list_sla_policies: "Listing SLA policies...",
    get_solution_article: "Fetching solution article...",
    list_canned_responses: "Listing canned responses...",
    get_canned_response: "Fetching canned response...",
    get_ticket_approval: "Fetching ticket approval...",
    list_ticket_approvals: "Listing ticket approvals...",
    list_ticket_tasks: "Listing ticket tasks...",
    get_ticket_task: "Fetching ticket task...",
    create_ticket: "Creating ticket...",
    update_ticket: "Updating ticket...",
    add_ticket_note: "Adding note...",
    add_ticket_reply: "Adding reply...",
    create_ticket_task: "Creating ticket task...",
    update_ticket_task: "Updating ticket task...",
    delete_ticket_task: "Deleting ticket task...",
    request_service_item: "Requesting service item...",
    request_service_approval: "Requesting approval...",
    create_solution_article: "Creating solution article...",
  },
  google_drive: {
    list_drives: "Listing drives...",
    search_files: "Searching files...",
    get_file_content: "Reading file...",
  },
  slideshow: {
    create_slideshow_file: "Creating slideshow...",
    edit_slideshow_file: "Editing slideshow...",
    retrieve_slideshow_file: "Retrieving slideshow...",
  },
  deep_dive: {
    handoff: "Starting deep research...",
  },
  slack_bot: {
    list_public_channels: "Listing Slack channels...",
    list_users: "Listing Slack users...",
    get_user: "Fetching Slack user...",
    read_channel_history: "Reading channel history...",
    read_thread_messages: "Reading thread messages...",
    post_message: "Posting message...",
    add_reaction: "Adding reaction...",
    remove_reaction: "Removing reaction...",
  },
  openai_usage: {
    get_completions_usage: "Fetching usage data...",
    get_organization_costs: "Fetching cost data...",
  },
  confluence: {
    get_current_user: "Fetching current user...",
    get_pages: "Fetching Confluence pages...",
    create_page: "Creating Confluence page...",
    update_page: "Updating page...",
  },
  elevenlabs: {
    text_to_speech: "Generating speech...",
    generate_music: "Generating music...",
  },
  microsoft_drive: {
    search_in_files: "Searching in files...",
    search_drive_items: "Searching drive items...",
    get_file_content: "Reading file...",
  },
  microsoft_teams: {
    search_messages: "Searching Teams messages...",
  },
  search: {
    semantic_search: "Searching...",
  },
  run_agent: {
    run_agent: "Running agent...",
  },
  primitive_types_debugger: {
    tool_without_user_config: "Testing without config...",
    pass_through: "Testing with config...",
  },
  common_utilities: {
    generate_random_number: "Generating random number...",
    generate_random_float: "Generating random float...",
    wait: "Waiting...",
    get_current_time: "Getting current time...",
  },
  jit_testing: {
    jit_all_optionals_and_defaults: "Testing configurations...",
  },
  reasoning: {
    advanced_reasoning: "Reasoning...",
  },
  query_tables_v2: {
    query_tables: "Querying tables...",
    get_database_schema: "Fetching schema...",
    execute_database_query: "Executing query...",
  },
  data_sources_file_system: {
    find: "Searching files...",
    cat: "Reading file...",
    locate_in_tree: "Locating in tree...",
    list: "Listing files...",
    semantic_search: "Searching...",
  },
  agent_management: {
    create_agent: "Creating agent...",
  },
  data_warehouses: {
    list: "Listing tables...",
    find: "Searching tables...",
    describe_tables: "Describing tables...",
    query: "Querying data warehouse...",
  },
  toolsets: {
    list_toolsets: "Listing toolsets...",
    get_toolset: "Fetching toolset...",
  },
  "web_search_&_browse": {
    websearch: "Searching the web...",
    webbrowser: "Browsing page...",
  },
} satisfies Record<InternalMCPServerNameType, Record<string, ToolLabelConfig>>;

/**
 * Helper to convert a tool name to a display name.
 * Converts snake_case to Title Case.
 */
function toolNameToDisplayName(toolName: string): string {
  return toolName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Get the display name for a tool (shown in sidebar when not running).
 */
export function getToolDisplayName(
  serverName: InternalMCPServerNameType,
  toolName: string
): string {
  const serverLabels = INTERNAL_MCP_TOOLS_LABELS[serverName];
  if (!serverLabels) {
    return toolNameToDisplayName(toolName);
  }

  const config = (serverLabels as Record<string, ToolLabelConfig | undefined>)[
    toolName
  ];
  if (!config) {
    return toolNameToDisplayName(toolName);
  }

  if (typeof config === "string") {
    // Legacy format: derive display name from tool name
    return toolNameToDisplayName(toolName);
  }

  return config.displayName;
}

/**
 * Get the running label for a tool (shown while executing).
 */
export function getToolRunningLabel(
  serverName: InternalMCPServerNameType,
  toolName: string
): string {
  const serverLabels = INTERNAL_MCP_TOOLS_LABELS[serverName];
  if (!serverLabels) {
    return toolNameToDisplayName(toolName) + "...";
  }

  const config = (serverLabels as Record<string, ToolLabelConfig | undefined>)[
    toolName
  ];
  if (!config) {
    return toolNameToDisplayName(toolName) + "...";
  }

  if (typeof config === "string") {
    // Legacy format: string is the running label
    return config;
  }

  return config.runningLabel;
}
