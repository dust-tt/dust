/**
 * Tool descriptions extracted from MCP server definitions.
 * These descriptions are shown on integration pages to help users understand
 * what each tool does.
 *
 * Format: { serverName: { toolName: description } }
 */
export const TOOL_DESCRIPTIONS: Record<string, Record<string, string>> = {
  vanta: {
    list_tests:
      "List Vanta's automated security and compliance tests with optional filtering by status, category, framework, or integration",
    list_test_entities:
      "Get the resources monitored by a specific security test, filter by status using FAILING or DEACTIVATED",
    list_controls:
      "List security controls in your Vanta account or retrieve a specific control by ID with framework mapping details",
    list_control_tests:
      "Enumerate automated tests that validate a specific security control, including status and failing entity information",
    list_control_documents:
      "List documents mapped to a control to locate supporting evidence quickly",
    list_documents:
      "List compliance documents in your Vanta account or retrieve a specific document by ID",
    list_document_resources:
      "Retrieve resources linked to a document (controls, links, uploads) by choosing the desired resource type",
    list_integrations:
      "List integrations connected to your Vanta account or retrieve details for a specific integration",
    list_frameworks:
      "List compliance frameworks in your Vanta account with completion status and progress metrics",
    list_framework_controls:
      "Retrieve the controls associated with a compliance framework, including descriptions and implementation guidance",
    list_people:
      "List people in your Vanta account or retrieve a specific person by ID with role and group membership",
    list_risks:
      "List risk scenarios in your risk register or retrieve a specific scenario to review status, scoring, and treatment",
    list_vulnerabilities:
      "List vulnerabilities detected across your infrastructure with CVE details, severity, and impacted assets",
  },
  github: {
    create_issue: "Create a new issue in a GitHub repository",
    comment_on_issue: "Add a comment to an existing GitHub issue",
    add_issue_to_project: "Add an issue to a GitHub project board",
    get_pull_request: "Get details of a specific pull request",
    list_organization_projects: "List all projects in a GitHub organization",
    list_issues: "List issues in a repository with optional filters",
    list_pull_requests: "List pull requests in a repository",
    search_advanced: "Search across GitHub repositories, issues, and code",
    get_issue: "Get details of a specific issue",
  },
  hubspot: {
    get_object_properties: "Get property definitions for a HubSpot object type",
    get_object_by_email: "Find a HubSpot contact or company by email address",
    get_latest_objects: "Get recently created or updated objects",
    get_contact: "Get a specific contact by ID",
    get_company: "Get a specific company by ID",
    get_deal: "Get a specific deal by ID",
    get_meeting: "Get a specific meeting by ID",
    get_file_public_url: "Get a public URL for a HubSpot file",
    get_associated_meetings:
      "Get meetings associated with a contact or company",
    get_hubspot_link: "Generate a direct link to a HubSpot record",
    get_hubspot_portal_id: "Get the HubSpot portal ID for the account",
    list_owners: "List all owners in the HubSpot account",
    search_owners: "Search for owners by name or email",
    get_current_user_id: "Get the ID of the currently authenticated user",
    get_user_activity: "Get activity history for a user",
    list_associations: "List associations between HubSpot objects",
    count_objects_by_properties:
      "Count objects matching specific property filters",
    search_crm_objects: "Search CRM objects with advanced filters",
    create_contact: "Create a new contact in HubSpot",
    create_company: "Create a new company in HubSpot",
    create_deal: "Create a new deal in HubSpot",
    create_engagement: "Create a new engagement (note, call, email, etc.)",
    update_contact: "Update an existing contact's properties",
    update_company: "Update an existing company's properties",
    update_deal: "Update an existing deal's properties",
  },
  salesforce: {
    search: "Search across Salesforce objects using SOSL",
    query: "Query Salesforce objects using SOQL",
    get_record: "Get a specific record by ID",
    create_record: "Create a new record in Salesforce",
    update_record: "Update an existing record",
    get_user: "Get details about a Salesforce user",
    list_objects: "List available Salesforce object types",
    describe_object: "Get metadata about a Salesforce object type",
  },
  slack: {
    send_message: "Send a message to a Slack channel or user",
    list_channels: "List available Slack channels",
    list_users: "List users in the Slack workspace",
    get_channel_history: "Get message history from a channel",
    search_messages: "Search for messages across Slack",
    get_user_info: "Get information about a Slack user",
    add_reaction: "Add an emoji reaction to a message",
    reply_to_thread: "Reply to a message thread",
  },
  notion: {
    search: "Search across Notion pages and databases",
    retrieve_page: "Get the content and properties of a Notion page",
    retrieve_database_schema: "Get the schema of a Notion database",
    query_database: "Query a Notion database with filters",
    create_page: "Create a new Notion page",
    update_page: "Update an existing Notion page",
    append_blocks: "Append content blocks to a page",
  },
  gmail: {
    search_messages: "Search emails using Gmail search syntax",
    get_message: "Get the full content of an email",
    send_email: "Send a new email",
    create_draft: "Create an email draft",
    reply_to_message: "Reply to an email thread",
    list_labels: "List all Gmail labels",
    get_thread: "Get all messages in an email thread",
  },
  google_calendar: {
    list_events: "List calendar events within a date range",
    get_event: "Get details of a specific calendar event",
    create_event: "Create a new calendar event",
    update_event: "Update an existing calendar event",
    delete_event: "Delete a calendar event",
    list_calendars: "List all accessible calendars",
  },
  jira: {
    search_issues: "Search Jira issues using JQL",
    get_issue: "Get details of a specific Jira issue",
    create_issue: "Create a new Jira issue",
    update_issue: "Update an existing Jira issue",
    add_comment: "Add a comment to a Jira issue",
    list_projects: "List all accessible Jira projects",
    get_transitions: "Get available status transitions for an issue",
    transition_issue: "Change the status of an issue",
  },
  confluence: {
    search: "Search across Confluence spaces and pages",
    get_page: "Get the content of a Confluence page",
    create_page: "Create a new Confluence page",
    update_page: "Update an existing Confluence page",
    list_spaces: "List all accessible Confluence spaces",
    get_space: "Get details about a Confluence space",
  },
  zendesk: {
    search_tickets: "Search Zendesk tickets with filters",
    get_ticket: "Get details of a specific ticket",
    create_ticket: "Create a new support ticket",
    update_ticket: "Update an existing ticket",
    add_comment: "Add a comment to a ticket",
    list_users: "List Zendesk users",
    get_user: "Get details about a Zendesk user",
  },
  freshservice: {
    list_tickets: "List service desk tickets with optional filters",
    get_ticket: "Get details of a specific ticket",
    create_ticket: "Create a new service desk ticket",
    update_ticket: "Update an existing ticket",
    list_agents: "List all agents in Freshservice",
    list_requesters: "List all requesters",
    get_asset: "Get details about an IT asset",
  },
  monday: {
    get_boards: "List all Monday.com boards",
    get_board_items: "Get items from a specific board",
    create_item: "Create a new item on a board",
    update_item: "Update an existing item",
    get_updates: "Get updates/comments on an item",
    add_update: "Add a comment to an item",
  },
  google_sheets: {
    read_sheet: "Read data from a Google Sheets spreadsheet",
    write_sheet: "Write data to a spreadsheet",
    create_spreadsheet: "Create a new spreadsheet",
    list_sheets: "List all sheets in a spreadsheet",
    append_rows: "Append rows to a sheet",
  },
  microsoft_excel: {
    read_worksheet: "Read data from an Excel worksheet",
    write_worksheet: "Write data to a worksheet",
    list_worksheets: "List all worksheets in a workbook",
    create_worksheet: "Create a new worksheet",
  },
  outlook: {
    get_messages: "Get emails from Outlook inbox or folder",
    get_drafts: "Get email drafts",
    create_draft: "Create a new email draft",
    delete_draft: "Delete an email draft",
    create_reply_draft: "Create a reply draft for an email",
    get_contacts: "Get Outlook contacts",
    create_contact: "Create a new contact",
    update_contact: "Update an existing contact",
  },
  outlook_calendar: {
    list_events: "List calendar events within a date range",
    get_event: "Get details of a specific event",
    create_event: "Create a new calendar event",
    update_event: "Update an existing event",
    delete_event: "Delete a calendar event",
  },
  google_drive: {
    search_files: "Search for files in Google Drive",
    get_file: "Get metadata about a file",
    list_files: "List files in a folder",
    create_folder: "Create a new folder",
  },
  microsoft_drive: {
    search_files: "Search for files in OneDrive",
    get_file: "Get metadata about a file",
    list_files: "List files in a folder",
    create_folder: "Create a new folder",
  },
  front: {
    list_conversations: "List Front conversations with filters",
    get_conversation: "Get details of a specific conversation",
    send_reply: "Send a reply in a conversation",
    add_comment: "Add an internal comment to a conversation",
    list_inboxes: "List all Front inboxes",
    list_teammates: "List all teammates",
  },
  ashby: {
    list_candidates: "List candidates in your Ashby account",
    get_candidate: "Get details of a specific candidate",
    search_candidates: "Search candidates by name or email",
    list_jobs: "List open job postings",
    get_job: "Get details of a specific job",
    list_applications: "List applications for a job",
  },
  salesloft: {
    list_people: "List people in your Salesloft account",
    get_person: "Get details of a specific person",
    create_person: "Create a new person record",
    list_cadences: "List sales cadences",
    add_to_cadence: "Add a person to a cadence",
    list_activities: "List sales activities",
  },
  slab: {
    search: "Search across Slab posts and topics",
    get_post: "Get the content of a Slab post",
    list_topics: "List all Slab topics",
    create_post: "Create a new Slab post",
    update_post: "Update an existing post",
  },
  databricks: {
    list_catalogs: "List all catalogs in the Databricks workspace",
    list_schemas: "List schemas in a catalog",
    list_tables: "List tables in a schema",
    query: "Execute a SQL query on Databricks",
    get_table_schema: "Get the schema of a table",
  },
  val_town: {
    run_val: "Execute a Val Town val (serverless function)",
    list_vals: "List your Val Town vals",
    get_val: "Get the code and details of a val",
  },
  http_client: {
    request: "Make an HTTP request to any URL",
  },
  openai_usage: {
    get_usage: "Get OpenAI API usage statistics",
    get_costs: "Get OpenAI API costs breakdown",
  },
  microsoft_teams: {
    send_message: "Send a message to a Teams channel",
    list_channels: "List channels in a team",
    list_teams: "List all teams",
    get_channel_messages: "Get messages from a channel",
  },
};

/**
 * Get the description for a tool, falling back to a generated description if not found.
 */
export function getToolDescription(
  serverName: string,
  toolName: string,
  fallbackDisplayName: string
): string {
  return (
    TOOL_DESCRIPTIONS[serverName]?.[toolName] ??
    `${fallbackDisplayName} operation`
  );
}
