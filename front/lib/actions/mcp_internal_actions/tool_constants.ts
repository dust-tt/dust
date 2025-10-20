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
    get_contact: {
      displayName: "Get Contact",
      runningLabel: "Fetching contact...",
    },
    get_company: {
      displayName: "Get Company",
      runningLabel: "Fetching company...",
    },
    get_deal: {
      displayName: "Get Deal",
      runningLabel: "Fetching deal...",
    },
    get_meeting: {
      displayName: "Get Meeting",
      runningLabel: "Fetching meeting...",
    },
    get_file_public_url: {
      displayName: "Get File Public URL",
      runningLabel: "Getting file URL...",
    },
    get_associated_meetings: {
      displayName: "Get Associated Meetings",
      runningLabel: "Fetching associated meetings...",
    },
    get_hubspot_link: {
      displayName: "Get HubSpot Link",
      runningLabel: "Fetching HubSpot link...",
    },
    get_hubspot_portal_id: {
      displayName: "Get HubSpot Portal ID",
      runningLabel: "Fetching portal ID...",
    },
    list_owners: {
      displayName: "List Owners",
      runningLabel: "Listing owners...",
    },
    search_owners: {
      displayName: "Search Owners",
      runningLabel: "Searching owners...",
    },
    get_current_user_id: {
      displayName: "Get Current User ID",
      runningLabel: "Fetching current user...",
    },
    get_user_activity: {
      displayName: "Get User Activity",
      runningLabel: "Fetching user activity...",
    },
    list_associations: {
      displayName: "List Associations",
      runningLabel: "Listing associations...",
    },
    count_objects_by_properties: {
      displayName: "Count Objects by Properties",
      runningLabel: "Counting objects...",
    },
    search_crm_objects: {
      displayName: "Search CRM Objects",
      runningLabel: "Searching CRM objects...",
    },
    export_crm_objects_csv: {
      displayName: "Export CRM Objects to CSV",
      runningLabel: "Exporting objects to CSV...",
    },
    create_contact: {
      displayName: "Create Contact",
      runningLabel: "Creating contact...",
    },
    create_company: {
      displayName: "Create Company",
      runningLabel: "Creating company...",
    },
    create_deal: {
      displayName: "Create Deal",
      runningLabel: "Creating deal...",
    },
    create_lead: {
      displayName: "Create Lead",
      runningLabel: "Creating lead...",
    },
    create_task: {
      displayName: "Create Task",
      runningLabel: "Creating task...",
    },
    create_note: {
      displayName: "Create Note",
      runningLabel: "Creating note...",
    },
    create_communication: {
      displayName: "Create Communication",
      runningLabel: "Creating communication...",
    },
    create_meeting: {
      displayName: "Create Meeting",
      runningLabel: "Creating meeting...",
    },
    create_association: {
      displayName: "Create Association",
      runningLabel: "Creating association...",
    },
    update_contact: {
      displayName: "Update Contact",
      runningLabel: "Updating contact...",
    },
    update_company: {
      displayName: "Update Company",
      runningLabel: "Updating company...",
    },
    update_deal: {
      displayName: "Update Deal",
      runningLabel: "Updating deal...",
    },
    remove_association: {
      displayName: "Remove Association",
      runningLabel: "Removing association...",
    },
  },
  agent_router: {
    list_all_published_agents: {
      displayName: "List All Published Agents",
      runningLabel: "Finding agents...",
    },
    suggest_agents_for_content: {
      displayName: "Suggest Agents for Content",
      runningLabel: "Suggesting agents...",
    },
  },
  include_data: {
    retrieve_recent_documents: {
      displayName: "Retrieve Recent Documents",
      runningLabel: "Loading recent documents...",
    },
    find_tags: {
      displayName: "Find Tags",
      runningLabel: "Finding tags...",
    },
  },
  run_dust_app: {
    run_dust_app: {
      displayName: "Run Dust App",
      runningLabel: "Running Dust app...",
    },
  },
  notion: {
    search: {
      displayName: "Search",
      runningLabel: "Searching Notion...",
    },
    retrieve_page: {
      displayName: "Retrieve Page",
      runningLabel: "Fetching page...",
    },
    retrieve_database_schema: {
      displayName: "Retrieve Database Schema",
      runningLabel: "Fetching database schema...",
    },
    retrieve_database_content: {
      displayName: "Retrieve Database Content",
      runningLabel: "Fetching database content...",
    },
    query_database: {
      displayName: "Query Database",
      runningLabel: "Querying database...",
    },
    retrieve_block: {
      displayName: "Retrieve Block",
      runningLabel: "Fetching block...",
    },
    retrieve_block_children: {
      displayName: "Retrieve Block Children",
      runningLabel: "Fetching block children...",
    },
    fetch_comments: {
      displayName: "Fetch Comments",
      runningLabel: "Fetching comments...",
    },
    list_users: {
      displayName: "List Users",
      runningLabel: "Listing users...",
    },
    get_about_user: {
      displayName: "Get About User",
      runningLabel: "Fetching user info...",
    },
    create_page: {
      displayName: "Create Page",
      runningLabel: "Creating page...",
    },
    insert_row_into_database: {
      displayName: "Insert Row into Database",
      runningLabel: "Inserting database row...",
    },
    create_database: {
      displayName: "Create Database",
      runningLabel: "Creating database...",
    },
    update_page: {
      displayName: "Update Page",
      runningLabel: "Updating page...",
    },
    add_page_content: {
      displayName: "Add Page Content",
      runningLabel: "Adding page content...",
    },
    create_comment: {
      displayName: "Create Comment",
      runningLabel: "Creating comment...",
    },
    delete_block: {
      displayName: "Delete Block",
      runningLabel: "Deleting block...",
    },
    update_row_database: {
      displayName: "Update Row Database",
      runningLabel: "Updating database row...",
    },
    update_schema_database: {
      displayName: "Update Schema Database",
      runningLabel: "Updating database schema...",
    },
  },
  extract_data: {
    extract_information_from_documents: {
      displayName: "Extract Information from Documents",
      runningLabel: "Extracting data from documents...",
    },
    find_tags: {
      displayName: "Find Tags",
      runningLabel: "Finding tags...",
    },
  },
  missing_action_catcher: {
    catch_missing_action: {
      displayName: "Catch Missing Action",
      runningLabel: "Processing action...",
    },
  },
  salesforce: {
    execute_read_query: {
      displayName: "Execute Read Query",
      runningLabel: "Querying Salesforce...",
    },
    list_objects: {
      displayName: "List Objects",
      runningLabel: "Listing Salesforce objects...",
    },
    describe_object: {
      displayName: "Describe Object",
      runningLabel: "Describing object...",
    },
    list_attachments: {
      displayName: "List Attachments",
      runningLabel: "Listing attachments...",
    },
    read_attachment: {
      displayName: "Read Attachment",
      runningLabel: "Reading attachment...",
    },
    update_object: {
      displayName: "Update Object",
      runningLabel: "Updating Salesforce object...",
    },
  },
  gmail: {
    get_drafts: {
      displayName: "Get Drafts",
      runningLabel: "Fetching email drafts...",
    },
    create_draft: {
      displayName: "Create Draft",
      runningLabel: "Creating email draft...",
    },
    get_messages: {
      displayName: "Get Messages",
      runningLabel: "Fetching emails...",
    },
    delete_draft: {
      displayName: "Delete Draft",
      runningLabel: "Deleting draft...",
    },
    create_reply_draft: {
      displayName: "Create Reply Draft",
      runningLabel: "Creating reply draft...",
    },
  },
  google_calendar: {
    list_calendars: {
      displayName: "List Calendars",
      runningLabel: "Listing calendars...",
    },
    list_events: {
      displayName: "List Events",
      runningLabel: "Listing events...",
    },
    get_event: {
      displayName: "Get Event",
      runningLabel: "Fetching event...",
    },
    create_event: {
      displayName: "Create Event",
      runningLabel: "Creating event...",
    },
    update_event: {
      displayName: "Update Event",
      runningLabel: "Updating event...",
    },
    delete_event: {
      displayName: "Delete Event",
      runningLabel: "Deleting event...",
    },
    check_availability: {
      displayName: "Check Availability",
      runningLabel: "Checking availability...",
    },
    get_user_timezones: {
      displayName: "Get User Timezones",
      runningLabel: "Fetching timezones...",
    },
  },
  conversation_files: {
    list_files: {
      displayName: "List Files",
      runningLabel: "Listing conversation files...",
    },
    cat: {
      displayName: "Cat",
      runningLabel: "Reading file...",
    },
  },
  slack: {
    search_messages: {
      displayName: "Search Messages",
      runningLabel: "Searching Slack messages...",
    },
    semantic_search_messages: {
      displayName: "Semantic Search Messages",
      runningLabel: "Searching Slack messages...",
    },
    list_users: {
      displayName: "List Users",
      runningLabel: "Listing Slack users...",
    },
    list_public_channels: {
      displayName: "List Public Channels",
      runningLabel: "Listing Slack channels...",
    },
    list_threads: {
      displayName: "List Threads",
      runningLabel: "Listing message threads...",
    },
    post_message: {
      displayName: "Post Message",
      runningLabel: "Posting Slack message...",
    },
    get_user: {
      displayName: "Get User",
      runningLabel: "Fetching Slack user...",
    },
  },
  google_sheets: {
    list_spreadsheets: {
      displayName: "List Spreadsheets",
      runningLabel: "Listing spreadsheets...",
    },
    get_spreadsheet: {
      displayName: "Get Spreadsheet",
      runningLabel: "Fetching spreadsheet...",
    },
    get_worksheet: {
      displayName: "Get Worksheet",
      runningLabel: "Fetching worksheet...",
    },
    update_cells: {
      displayName: "Update Cells",
      runningLabel: "Updating cells...",
    },
    append_data: {
      displayName: "Append Data",
      runningLabel: "Adding data...",
    },
    clear_range: {
      displayName: "Clear Range",
      runningLabel: "Clearing range...",
    },
    create_spreadsheet: {
      displayName: "Create Spreadsheet",
      runningLabel: "Creating spreadsheet...",
    },
    add_worksheet: {
      displayName: "Add Worksheet",
      runningLabel: "Adding worksheet...",
    },
    delete_worksheet: {
      displayName: "Delete Worksheet",
      runningLabel: "Deleting worksheet...",
    },
    format_cells: {
      displayName: "Format Cells",
      runningLabel: "Formatting cells...",
    },
    copy_sheet: {
      displayName: "Copy Sheet",
      runningLabel: "Copying sheet...",
    },
    rename_worksheet: {
      displayName: "Rename Worksheet",
      runningLabel: "Renaming worksheet...",
    },
    move_worksheet: {
      displayName: "Move Worksheet",
      runningLabel: "Moving worksheet...",
    },
  },
  monday: {
    get_boards: {
      displayName: "Get Boards",
      runningLabel: "Fetching boards...",
    },
    get_board_items: {
      displayName: "Get Board Items",
      runningLabel: "Fetching board items...",
    },
    get_item_details: {
      displayName: "Get Item Details",
      runningLabel: "Fetching item details...",
    },
    search_items: {
      displayName: "Search Items",
      runningLabel: "Searching items...",
    },
    get_items_by_column_value: {
      displayName: "Get Items by Column Value",
      runningLabel: "Fetching items by column...",
    },
    find_user_by_name: {
      displayName: "Find User by Name",
      runningLabel: "Finding user...",
    },
    get_board_values: {
      displayName: "Get Board Values",
      runningLabel: "Fetching board values...",
    },
    get_column_values: {
      displayName: "Get Column Values",
      runningLabel: "Fetching column values...",
    },
    get_file_column_values: {
      displayName: "Get File Column Values",
      runningLabel: "Fetching file columns...",
    },
    get_group_details: {
      displayName: "Get Group Details",
      runningLabel: "Fetching group details...",
    },
    get_subitem_values: {
      displayName: "Get Subitem Values",
      runningLabel: "Fetching subitem values...",
    },
    get_user_details: {
      displayName: "Get User Details",
      runningLabel: "Fetching user details...",
    },
    create_item: {
      displayName: "Create Item",
      runningLabel: "Creating item...",
    },
    update_item: {
      displayName: "Update Item",
      runningLabel: "Updating item...",
    },
    update_item_name: {
      displayName: "Update Item Name",
      runningLabel: "Updating item name...",
    },
    create_update: {
      displayName: "Create Update",
      runningLabel: "Creating update...",
    },
    create_board: {
      displayName: "Create Board",
      runningLabel: "Creating board...",
    },
    create_column: {
      displayName: "Create Column",
      runningLabel: "Creating column...",
    },
    create_group: {
      displayName: "Create Group",
      runningLabel: "Creating group...",
    },
    create_subitem: {
      displayName: "Create Subitem",
      runningLabel: "Creating subitem...",
    },
    update_subitem: {
      displayName: "Update Subitem",
      runningLabel: "Updating subitem...",
    },
    duplicate_group: {
      displayName: "Duplicate Group",
      runningLabel: "Duplicating group...",
    },
    upload_file_to_column: {
      displayName: "Upload File to Column",
      runningLabel: "Uploading file...",
    },
    delete_item: {
      displayName: "Delete Item",
      runningLabel: "Deleting item...",
    },
    delete_group: {
      displayName: "Delete Group",
      runningLabel: "Deleting group...",
    },
    move_item_to_board: {
      displayName: "Move Item to Board",
      runningLabel: "Moving item to board...",
    },
    create_multiple_items: {
      displayName: "Create Multiple Items",
      runningLabel: "Creating multiple items...",
    },
    get_activity_logs: {
      displayName: "Get Activity Logs",
      runningLabel: "Fetching activity logs...",
    },
    get_board_analytics: {
      displayName: "Get Board Analytics",
      runningLabel: "Fetching board analytics...",
    },
  },
  agent_memory: {
    memory_not_available: {
      displayName: "Memory Not Available",
      runningLabel: "Memory not available...",
    },
    retrieve: {
      displayName: "Retrieve",
      runningLabel: "Retrieving memory...",
    },
    record_entries: {
      displayName: "Record Entries",
      runningLabel: "Recording entries...",
    },
    erase_entries: {
      displayName: "Erase Entries",
      runningLabel: "Erasing entries...",
    },
    edit_entries: {
      displayName: "Edit Entries",
      runningLabel: "Editing entries...",
    },
  },
  jira: {
    get_issue: {
      displayName: "Get Issue",
      runningLabel: "Fetching Jira issue...",
    },
    get_projects: {
      displayName: "Get Projects",
      runningLabel: "Fetching projects...",
    },
    get_project: {
      displayName: "Get Project",
      runningLabel: "Fetching project...",
    },
    get_project_versions: {
      displayName: "Get Project Versions",
      runningLabel: "Fetching project versions...",
    },
    get_transitions: {
      displayName: "Get Transitions",
      runningLabel: "Fetching transitions...",
    },
    get_issues: {
      displayName: "Get Issues",
      runningLabel: "Fetching issues...",
    },
    get_issues_using_jql: {
      displayName: "Get Issues Using JQL",
      runningLabel: "Querying Jira...",
    },
    get_issue_types: {
      displayName: "Get Issue Types",
      runningLabel: "Fetching issue types...",
    },
    get_issue_create_fields: {
      displayName: "Get Issue Create Fields",
      runningLabel: "Fetching create fields...",
    },
    get_issue_read_fields: {
      displayName: "Get Issue Read Fields",
      runningLabel: "Fetching read fields...",
    },
    get_connection_info: {
      displayName: "Get Connection Info",
      runningLabel: "Fetching connection info...",
    },
    get_issue_link_types: {
      displayName: "Get Issue Link Types",
      runningLabel: "Fetching link types...",
    },
    get_users: {
      displayName: "Get Users",
      runningLabel: "Fetching users...",
    },
    get_attachments: {
      displayName: "Get Attachments",
      runningLabel: "Fetching attachments...",
    },
    read_attachment: {
      displayName: "Read Attachment",
      runningLabel: "Reading attachment...",
    },
    create_comment: {
      displayName: "Create Comment",
      runningLabel: "Creating comment...",
    },
    transition_issue: {
      displayName: "Transition Issue",
      runningLabel: "Transitioning issue...",
    },
    create_issue: {
      displayName: "Create Issue",
      runningLabel: "Creating Jira issue...",
    },
    update_issue: {
      displayName: "Update Issue",
      runningLabel: "Updating issue...",
    },
    create_issue_link: {
      displayName: "Create Issue Link",
      runningLabel: "Creating issue link...",
    },
    delete_issue_link: {
      displayName: "Delete Issue Link",
      runningLabel: "Deleting issue link...",
    },
    upload_attachment: {
      displayName: "Upload Attachment",
      runningLabel: "Uploading attachment...",
    },
  },
  interactive_content: {
    create_interactive_content_file: {
      displayName: "Create Interactive Content File",
      runningLabel: "Creating interactive file...",
    },
    edit_interactive_content_file: {
      displayName: "Edit Interactive Content File",
      runningLabel: "Editing interactive file...",
    },
    retrieve_interactive_content_file: {
      displayName: "Retrieve Interactive Content File",
      runningLabel: "Retrieving interactive file...",
    },
    revert_interactive_content_file: {
      displayName: "Revert Interactive Content File",
      runningLabel: "Reverting interactive file...",
    },
    rename_interactive_content_file: {
      displayName: "Rename Interactive Content File",
      runningLabel: "Renaming interactive file...",
    },
    get_interactive_content_file_share_url: {
      displayName: "Get Interactive Content File Share URL",
      runningLabel: "Getting share URL...",
    },
  },
  outlook: {
    get_messages: {
      displayName: "Get Messages",
      runningLabel: "Fetching emails...",
    },
    get_drafts: {
      displayName: "Get Drafts",
      runningLabel: "Fetching email drafts...",
    },
    create_draft: {
      displayName: "Create Draft",
      runningLabel: "Creating email draft...",
    },
    delete_draft: {
      displayName: "Delete Draft",
      runningLabel: "Deleting draft...",
    },
    create_reply_draft: {
      displayName: "Create Reply Draft",
      runningLabel: "Creating reply draft...",
    },
    get_contacts: {
      displayName: "Get Contacts",
      runningLabel: "Fetching contacts...",
    },
    create_contact: {
      displayName: "Create Contact",
      runningLabel: "Creating contact...",
    },
    update_contact: {
      displayName: "Update Contact",
      runningLabel: "Updating contact...",
    },
  },
  outlook_calendar: {
    get_user_timezone: {
      displayName: "Get User Timezone",
      runningLabel: "Fetching timezone...",
    },
    list_calendars: {
      displayName: "List Calendars",
      runningLabel: "Listing calendars...",
    },
    list_events: {
      displayName: "List Events",
      runningLabel: "Listing events...",
    },
    get_event: {
      displayName: "Get Event",
      runningLabel: "Fetching event...",
    },
    create_event: {
      displayName: "Create Event",
      runningLabel: "Creating event...",
    },
    update_event: {
      displayName: "Update Event",
      runningLabel: "Updating event...",
    },
    delete_event: {
      displayName: "Delete Event",
      runningLabel: "Deleting event...",
    },
    check_availability: {
      displayName: "Check Availability",
      runningLabel: "Checking availability...",
    },
  },
  freshservice: {
    list_tickets: {
      displayName: "List Tickets",
      runningLabel: "Listing tickets...",
    },
    get_ticket: {
      displayName: "Get Ticket",
      runningLabel: "Fetching ticket...",
    },
    get_ticket_read_fields: {
      displayName: "Get Ticket Read Fields",
      runningLabel: "Fetching ticket fields...",
    },
    get_ticket_write_fields: {
      displayName: "Get Ticket Write Fields",
      runningLabel: "Fetching ticket fields...",
    },
    list_departments: {
      displayName: "List Departments",
      runningLabel: "Listing departments...",
    },
    list_products: {
      displayName: "List Products",
      runningLabel: "Listing products...",
    },
    list_oncall_schedules: {
      displayName: "List Oncall Schedules",
      runningLabel: "Listing on-call schedules...",
    },
    list_service_categories: {
      displayName: "List Service Categories",
      runningLabel: "Listing service categories...",
    },
    list_service_items: {
      displayName: "List Service Items",
      runningLabel: "Listing service items...",
    },
    search_service_items: {
      displayName: "Search Service Items",
      runningLabel: "Searching service items...",
    },
    get_service_item: {
      displayName: "Get Service Item",
      runningLabel: "Fetching service item...",
    },
    get_service_item_fields: {
      displayName: "Get Service Item Fields",
      runningLabel: "Fetching service item fields...",
    },
    list_solution_categories: {
      displayName: "List Solution Categories",
      runningLabel: "Listing solution categories...",
    },
    list_solution_folders: {
      displayName: "List Solution Folders",
      runningLabel: "Listing solution folders...",
    },
    list_solution_articles: {
      displayName: "List Solution Articles",
      runningLabel: "Listing solution articles...",
    },
    list_requesters: {
      displayName: "List Requesters",
      runningLabel: "Listing requesters...",
    },
    get_requester: {
      displayName: "Get Requester",
      runningLabel: "Fetching requester...",
    },
    list_purchase_orders: {
      displayName: "List Purchase Orders",
      runningLabel: "Listing purchase orders...",
    },
    list_sla_policies: {
      displayName: "List SLA Policies",
      runningLabel: "Listing SLA policies...",
    },
    get_solution_article: {
      displayName: "Get Solution Article",
      runningLabel: "Fetching solution article...",
    },
    list_canned_responses: {
      displayName: "List Canned Responses",
      runningLabel: "Listing canned responses...",
    },
    get_canned_response: {
      displayName: "Get Canned Response",
      runningLabel: "Fetching canned response...",
    },
    get_ticket_approval: {
      displayName: "Get Ticket Approval",
      runningLabel: "Fetching ticket approval...",
    },
    list_ticket_approvals: {
      displayName: "List Ticket Approvals",
      runningLabel: "Listing ticket approvals...",
    },
    list_ticket_tasks: {
      displayName: "List Ticket Tasks",
      runningLabel: "Listing ticket tasks...",
    },
    get_ticket_task: {
      displayName: "Get Ticket Task",
      runningLabel: "Fetching ticket task...",
    },
    create_ticket: {
      displayName: "Create Ticket",
      runningLabel: "Creating ticket...",
    },
    update_ticket: {
      displayName: "Update Ticket",
      runningLabel: "Updating ticket...",
    },
    add_ticket_note: {
      displayName: "Add Ticket Note",
      runningLabel: "Adding note...",
    },
    add_ticket_reply: {
      displayName: "Add Ticket Reply",
      runningLabel: "Adding reply...",
    },
    create_ticket_task: {
      displayName: "Create Ticket Task",
      runningLabel: "Creating ticket task...",
    },
    update_ticket_task: {
      displayName: "Update Ticket Task",
      runningLabel: "Updating ticket task...",
    },
    delete_ticket_task: {
      displayName: "Delete Ticket Task",
      runningLabel: "Deleting ticket task...",
    },
    request_service_item: {
      displayName: "Request Service Item",
      runningLabel: "Requesting service item...",
    },
    request_service_approval: {
      displayName: "Request Service Approval",
      runningLabel: "Requesting approval...",
    },
    create_solution_article: {
      displayName: "Create Solution Article",
      runningLabel: "Creating solution article...",
    },
  },
  google_drive: {
    list_drives: {
      displayName: "List Drives",
      runningLabel: "Listing drives...",
    },
    search_files: {
      displayName: "Search Files",
      runningLabel: "Searching files...",
    },
    get_file_content: {
      displayName: "Get File Content",
      runningLabel: "Reading file...",
    },
  },
  slideshow: {
    create_slideshow_file: {
      displayName: "Create Slideshow File",
      runningLabel: "Creating slideshow...",
    },
    edit_slideshow_file: {
      displayName: "Edit Slideshow File",
      runningLabel: "Editing slideshow...",
    },
    retrieve_slideshow_file: {
      displayName: "Retrieve Slideshow File",
      runningLabel: "Retrieving slideshow...",
    },
  },
  deep_dive: {
    handoff: {
      displayName: "Handoff",
      runningLabel: "Starting deep research...",
    },
  },
  slack_bot: {
    list_public_channels: {
      displayName: "List Public Channels",
      runningLabel: "Listing Slack channels...",
    },
    list_users: {
      displayName: "List Users",
      runningLabel: "Listing Slack users...",
    },
    get_user: {
      displayName: "Get User",
      runningLabel: "Fetching Slack user...",
    },
    read_channel_history: {
      displayName: "Read Channel History",
      runningLabel: "Reading channel history...",
    },
    read_thread_messages: {
      displayName: "Read Thread Messages",
      runningLabel: "Reading thread messages...",
    },
    post_message: {
      displayName: "Post Message",
      runningLabel: "Posting message...",
    },
    add_reaction: {
      displayName: "Add Reaction",
      runningLabel: "Adding reaction...",
    },
    remove_reaction: {
      displayName: "Remove Reaction",
      runningLabel: "Removing reaction...",
    },
  },
  openai_usage: {
    get_completions_usage: {
      displayName: "Get Completions Usage",
      runningLabel: "Fetching usage data...",
    },
    get_organization_costs: {
      displayName: "Get Organization Costs",
      runningLabel: "Fetching cost data...",
    },
  },
  confluence: {
    get_current_user: {
      displayName: "Get Current User",
      runningLabel: "Fetching current user...",
    },
    get_pages: {
      displayName: "Get Pages",
      runningLabel: "Fetching Confluence pages...",
    },
    create_page: {
      displayName: "Create Page",
      runningLabel: "Creating Confluence page...",
    },
    update_page: {
      displayName: "Update Page",
      runningLabel: "Updating page...",
    },
  },
  elevenlabs: {
    text_to_speech: {
      displayName: "Text to Speech",
      runningLabel: "Generating speech...",
    },
    generate_music: {
      displayName: "Generate Music",
      runningLabel: "Generating music...",
    },
  },
  microsoft_drive: {
    search_in_files: {
      displayName: "Search in Files",
      runningLabel: "Searching in files...",
    },
    search_drive_items: {
      displayName: "Search Drive Items",
      runningLabel: "Searching drive items...",
    },
    get_file_content: {
      displayName: "Get File Content",
      runningLabel: "Reading file...",
    },
  },
  microsoft_teams: {
    search_messages: {
      displayName: "Search Messages",
      runningLabel: "Searching Teams messages...",
    },
  },
  search: {
    semantic_search: {
      displayName: "Semantic Search",
      runningLabel: "Searching...",
    },
    find_tags: {
      displayName: "Find Tags",
      runningLabel: "Finding tags...",
    },
  },
  run_agent: {
    run_agent: {
      displayName: "Run Agent",
      runningLabel: "Running agent...",
    },
  },
  primitive_types_debugger: {
    tool_without_user_config: {
      displayName: "Tool Without User Config",
      runningLabel: "Testing without config...",
    },
    pass_through: {
      displayName: "Pass Through",
      runningLabel: "Testing with config...",
    },
  },
  common_utilities: {
    generate_random_number: {
      displayName: "Generate Random Number",
      runningLabel: "Generating random number...",
    },
    generate_random_float: {
      displayName: "Generate Random Float",
      runningLabel: "Generating random float...",
    },
    wait: {
      displayName: "Wait",
      runningLabel: "Waiting...",
    },
    get_current_time: {
      displayName: "Get Current Time",
      runningLabel: "Getting current time...",
    },
  },
  jit_testing: {
    jit_all_optionals_and_defaults: {
      displayName: "JIT All Optionals and Defaults",
      runningLabel: "Testing configurations...",
    },
  },
  reasoning: {
    advanced_reasoning: {
      displayName: "Advanced Reasoning",
      runningLabel: "Reasoning...",
    },
  },
  query_tables_v2: {
    query_tables: {
      displayName: "Query Tables",
      runningLabel: "Querying tables...",
    },
    get_database_schema: {
      displayName: "Get Database Schema",
      runningLabel: "Fetching schema...",
    },
    execute_database_query: {
      displayName: "Execute Database Query",
      runningLabel: "Executing query...",
    },
  },
  data_sources_file_system: {
    find: {
      displayName: "Find",
      runningLabel: "Searching files...",
    },
    cat: {
      displayName: "Cat",
      runningLabel: "Reading file...",
    },
    locate_in_tree: {
      displayName: "Locate in Tree",
      runningLabel: "Locating in tree...",
    },
    list: {
      displayName: "List",
      runningLabel: "Listing files...",
    },
    semantic_search: {
      displayName: "Semantic Search",
      runningLabel: "Searching...",
    },
    find_tags: {
      displayName: "Find Tags",
      runningLabel: "Finding tags...",
    },
  },
  agent_management: {
    create_agent: {
      displayName: "Create Agent",
      runningLabel: "Creating agent...",
    },
  },
  data_warehouses: {
    list: {
      displayName: "List",
      runningLabel: "Listing tables...",
    },
    find: {
      displayName: "Find",
      runningLabel: "Searching tables...",
    },
    describe_tables: {
      displayName: "Describe Tables",
      runningLabel: "Describing tables...",
    },
    query: {
      displayName: "Query",
      runningLabel: "Querying data warehouse...",
    },
  },
  toolsets: {
    list_toolsets: {
      displayName: "List Toolsets",
      runningLabel: "Listing toolsets...",
    },
    get_toolset: {
      displayName: "Get Toolset",
      runningLabel: "Fetching toolset...",
    },
  },
  "web_search_&_browse": {
    websearch: {
      displayName: "Web Search",
      runningLabel: "Searching the web...",
    },
    webbrowser: {
      displayName: "Web Browser",
      runningLabel: "Browsing page...",
    },
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
