export const JIRA_SERVER_INSTRUCTIONS = `
      You have access to the following tools: get_issue, get_projects, get_project, get_transitions, create_comment, get_issues, get_issue_types, get_issue_create_fields, get_connection_info, transition_issue, create_issue, update_issue, create_issue_link, delete_issue_link, get_issue_link_types, get_users, get_issue_read_fields.

      # General Workflow for JIRA Data:
      1.  **Authenticate:** Use \`get_connection_info\` to authenticate with JIRA if you are not authenticated ("No access token found").
      2.  **For Create/Update Operations:** Always use \`get_issue_types\` and \`get_issue_create_fields\` with the specific issue typename to get its create/update-time metadata (fields available on the Create/Update screens).
      3.  **Execute Read Query:** Use \`get_issues\` to retrieve data using JQL. Construct your JQL queries based on the information obtained from \`get_issue_types\` to ensure you are using correct field and relationship names.

      **Best Practices for Querying:**
      1.  **Discover Object Structure First:** Use \`get_issue_create_fields\` to understand fields available for create/update in a given project and issue type. Alternatively, for a quick field list directly in a query, use \`get_issues\`.
      2.  **Verify Field and Relationship Names:** If you encounter JIRA 400 errors suggesting that the field or relationship does not exist, use \`get_issue_types\` for the relevant object(s) to confirm the exact names and their availability.

      **Field Selection for get_issue (Optional Performance Optimization):**
      - By default, \`get_issue\` returns essential fields: summary, issuetype, priority, assignee, reporter, labels, duedate, parent, project, status
      - Only use \`get_issue_read_fields\` if you need additional custom fields or want to optimize performance by requesting specific fields
      - For built-in fields use the \`key\` (e.g., "summary", "issuetype", "status"). For custom fields use the \`id\` (e.g., "customfield_10020").

      **User Lookup (get_users):**
      - Provide emailAddress for exact match on email. Example: { "emailAddress": "jane.doe@acme.com" }
      - Or provide name for case-insensitive contains on display name. Example: { "name": "Jane" }
      - If neither emailAddress nor name is provided, the tool lists the first maxResults users.
      - For pagination, pass startAt using the previous result's nextStartAt. Example: { "name": "Jane", "startAt": 100 }
    `;

export const FRESHSERVICE_SERVER_INSTRUCTIONS = `
     **Best Practices:**
      - Use specific filters when listing tickets to narrow down results
      - By default, \`list_tickets\` returns minimal fields (id, subject, status) for performance
      - By default, \`get_ticket\` returns essential fields for detailed information
      - Use \`get_ticket_read_fields\` only if you need additional custom fields
      - Use \`include\` parameter with \`get_ticket\` to get related data like conversations, requester info, etc.

     **Ticket Fields:**
      - Before creating or updating a ticket, use \`get_ticket_write_fields\` to discover available ticket fields including standard and custom fields

     **Service Request Fields:**
      - **Before creating ANY service request, you MUST:**
        1. Call \`get_service_item_fields\` with the service item's display_id
        2. Review the returned required_fields and hidden_required_fields
        3. Collect values for ALL required fields (even if not visible in portal)
        4. Only then call \`request_service_item\` with the complete fields object
      - **Fields in the API behave like the agent portal's new service request page**
      - **If a field is marked mandatory but not visible in portal, you MUST provide a value for it in the API**
      - **Missing required fields will result in 404 errors when placing service requests**
      - **The \`request_service_item\` tool automatically validates required fields and will fail if any are missing**
      - **Example workflow:**
        \`\`\`
        1. get_service_item_fields(display_id: 123)
        2. Review required_fields array
        3. Collect values for all required fields
        4. request_service_item(display_id: 123, fields: {field1: "value1", field2: "value2"})
        \`\`\`
    `;

export const DATA_SOURCE_FILESYSTEM_SERVER_INSTRUCTIONS =
  "This server contains tools to browse and search data in the space denoted by the server name, with a filesystem-like navigation.\n" +
  "The space's contents are structured in nodes, similar to a filesystem. Nodes are identified by a unique ID called `nodeId`.\n" +
  "Node IDs are exposed in the outputs of the tools described below.\n" +
  "The `list` tool lists child nodes of a given node, like 'ls' in Unix. It should only be used on nodes with children (hasChildren: true).\n" +
  "It can be used to explore the filesystem structure step by step " +
  "by being called recursively with the 'nodeId' output in a step passed to the next step's nodeId.\n" +
  "The `find` tool finds a node based on its title starting from a specific root node, like using 'find' in Unix.\n" +
  "The `cat` tool reads the actual content in a document node, like 'cat' in Unix.\n" +
  "The `locate_in_tree` tool finds the path to a node in the filesystem tree.\n" +
  "The `semantic_search` tool performs a semantic search within the nodes designated by `nodeIds`.\n" +
  "Note: these tools are specific to data in the space denoted by the server name. For attachments and files in the current conversation, prefer the conversation's own attachment and file tools when available.";
