export const SALESFORCE_SERVER_INSTRUCTIONS = `You have access to the following tools: execute_read_query, list_objects, and describe_object.

# General Workflow for Salesforce Data:
1.  **List Objects (Optional):** If you don't know the exact name of an object, use \`list_objects\` to find it.
2.  **Describe Object:** Use \`describe_object\` with the specific object name (e.g., \`Account\`, \`MyCustomObject__c\`) to get its detailed metadata. This will show you all available fields, their exact names, data types, and information about relationships (child relationships are particularly important for subqueries).
3.  **Execute Read Query:** Use \`execute_read_query\` to retrieve data using SOQL. Construct your SOQL queries based on the information obtained from \`describe_object\` to ensure you are using correct field and relationship names.

# execute_read_query
You can use it to execute SOQL read queries on Salesforce. Queries can be used to retrieve or discover data, never to write data.

**Best Practices for Querying:**
1.  **Discover Object Structure First:** ALWAYS use \`describe_object(objectName='YourObjectName')\` to understand an object's fields and relationships before writing complex queries. Alternatively, for a quick field list directly in a query, use \`FIELDS()\` (e.g., \`SELECT FIELDS(ALL) FROM Account LIMIT 1\`). This helps prevent errors from misspelled or non-existent field/relationship names. The \`FIELDS()\` function requires a \`LIMIT\` clause, with a maximum of 200.
2.  **Verify Field and Relationship Names:** If you encounter "No such column" or "Didn't understand relationship" errors, use \`describe_object\` for the relevant object(s) to confirm the exact names and their availability. For example, child relationship names used in subqueries (e.g., \`(SELECT Name FROM Contacts)\` or \`(SELECT Name FROM MyCustomChildren__r)\`) can be found in the output of \`describe_object\`.

**Custom Objects, Fields, and Relationships:**
-   **Custom Objects & Fields:** When referencing custom objects or fields, append \`__c\` to their names (e.g., \`MyCustomField__c\`, \`MyCustomObject__c\`). Confirm these names using \`describe_object\`.
-   **Custom Relationships:** When referencing custom relationships (typically in parent-to-child subqueries), append \`__r\` to the relationship name (e.g., \`(SELECT Name FROM MyCustomRelatedObjects__r)\`). \`describe_object\` will list these child relationship names.

**FIELDS() Keyword Details (Alternative to describe_object for quick field listing in query):**
Use \`FIELDS(ALL)\`, \`FIELDS(CUSTOM)\`, or \`FIELDS(STANDARD)\` in your \`SELECT\` statement to retrieve groups of fields.
-   \`FIELDS(ALL)\`: Selects all fields.
-   \`FIELDS(CUSTOM)\`: Selects all custom fields.
-   \`FIELDS(STANDARD)\`: Selects all standard fields.
Remember to include \`LIMIT\` (max 200) when using \`FIELDS()\`.

**Relationships in Queries (Confirm names with describe_object):**
-   **Child-to-Parent:** Use dot notation. E.g., \`SELECT Account.Name, LastName FROM Contact\`.
-   **Parent-to-Child (Subqueries):** Use a subquery. Confirm relationship name (e.g., \`Contacts\` or \`MyCustomChildren__r\`) via \`describe_object\`.
    -   Standard Relationship: \`SELECT Name, (SELECT FirstName, LastName FROM Contacts) FROM Account\`
    -   Custom Relationship: \`SELECT Name, (SELECT Name FROM MyCustomChildren__r) FROM Account\`

If errors persist after using \`describe_object\` and following these guidelines, the field, object, or relationship might genuinely not exist, or you may lack permissions.

# list_objects
You can use it to list the objects in Salesforce: standard and custom objects. Useful for finding object names if you're unsure.

# describe_object
Use this tool to get detailed metadata about a specific Salesforce object. Provide the object's API name (e.g., \`Account\`, \`Lead\`, \`MyCustomObject__c\`).
The output includes:
-   A list of all fields with their names, labels, types, and other properties.
-   Details about child relationships (useful for parent-to-child subqueries in SOQL), including the relationship name.
-   Information about record types.
-   Other object-level properties.
This is the most reliable way to discover the correct names for fields and relationships before writing an \`execute_read_query\`.
`;

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
  "The tools can be used to browse and search content with a filesystem-like navigation.\n" +
  "Content is structured in nodes. Nodes are identified by a unique ID called `nodeId`.\n" +
  "Node IDs are exposed in the outputs of the tools described below.\n" +
  "The `list` tool can be used to list the direct content under a node, like 'ls' in Unix.\n" +
  "Can be used to explore the filesystem structure step by step " +
  "by being called repeatedly with the 'nodeId' output in a step passed to the next step's nodeId.\n" +
  "The `find` tool can be used to find content based on their title starting from a specific root node, like using 'find' in Unix.\n" +
  "The `cat` tool can be used to read the actual content in a document node, like 'cat in Unix.\n" +
  "The `locate_in_tree` tool can be used to find the path to a node in the filesystem tree.\n" +
  "The `semantic_search` tool can be used to perform a semantic search within the folders and files designated by `nodeIds`.";
