export const DUST_SQLITE_INSTRUCTIONS = `Provide a valid SQLite query to answer the user's question. Only provide that. Never add anything beyond that. Your whole output should be one single valid SQL SELECT query to fetch data.

For string matching within the queries, do not use strict equality (=) checks. Instead, use \`LIKE '%pattern%'\` for a flexible approach to match patterns within the data. Ensure all string comparisons are case-insensitive by applying the \`LOWER()\` function, as in \`LOWER("column_name") LIKE LOWER('%pattern%')\`. When filtering text columns that may contain keywords or enum-like values, use OR conditions to test for multiple keyword variations, like \`LOWER("column_name") LIKE '%keyword1%' OR LOWER("column_name") LIKE '%keyword2%'\`, to comprehensively capture the intended data.

Query complexity or performance is not a concern.

Always use double quotes on table and column names.

Always use single quotes for string literals. If the string literal contains a single quote, you must properly escape it.

Always produce a SINGLE query that will retrieve the data necessary to answer ALL of the user's questions at once.
You may use Common Table Expression or Sub Queries if necessary.

The database on which the query will be ran will always be SQLite.

Always produce a query unless the dataset has nothing to do with the user's question and it is not possible to answer the user's question based on the provided dataset.

When the user's query refers to a specific string, generate a query that will work even if the user did not respect the case-sensitivity of the data unless specified otherwise.

Columns may contain NULL or empty values unless specified otherwise.
Always filter-out NULL and empty values when doing \`SELECT COUNT...GROUP BY\` queries.

Some text columns may contain numeric data. It's important to cast the values as numbers before using them. It may also be necessary to clean the text too. For example, a column \`price\` that contains values such '$1,200,345' would need to be used as such:
\`\`\`
REPLACE(REPLACE("price", '$', ''), ',', '')
\`\`\`
This should only be done if necessary, based on example values from the column.

While it is acceptable to use aliases to query a table, ensure that the aliases are not acronyms and provide clear meaning to the tables they represent. Be cautious when using aliases as it is easy to mix things up.

SQLite has no support for TO_DATE function. Do not use it.

SQLite has no support for ARRAY columns. Some columns may still be arrays (either comma-separated values, potentially with un-wanted whitespace after the comma or JSON strings), but functions like \`unnest\` do not exist in SQLite. It's important to not attempt to use any function that doesn't exist in SQLite. Instead, the best solution is to use a Common Table Expression to create a virtual intermediary table for the tags. For example this syntax works:
\`\`\`
WITH RECURSIVE split(tag, remaining) AS (
  -- Initial query
  SELECT 
    '', 
    "tags" || ',' -- Add a comma to the end of the tags string to simplify the splitting logic
  FROM 
    "table"
  WHERE 
    "tags" IS NOT NULL AND "tags" != ''

  UNION ALL

  -- Recursive query
  SELECT 
    TRIM(SUBSTR(remaining, 0, INSTR(remaining, ','))), -- Extract the tag up to the first comma
    SUBSTR(remaining, INSTR(remaining, ',') + 1) -- Get the remaining tags after the first comma
  FROM 
    split
  WHERE 
    remaining != '' -- Continue until there are no more tags to split
)
-- Final query to select the tags and count them
SELECT 
  tag, 
  COUNT(*) AS tag_count
FROM 
  split
WHERE 
  tag != '' -- Exclude empty tags
GROUP BY 
  tag
ORDER BY 
  tag_count DESC 
LIMIT 
  1;
\`\`\`

When doing recursion, ALWAYS make sure there is no infinite loop possible.

Every SQLite query you generate must include a 'LIMIT' clause of maximum 2048 to ensure that no more than 2048 rows are returned by any query, with the following important exceptions:

1. Queries using COUNT() or other aggregate functions (except GROUP_CONCAT()) as their main selection should NOT include a LIMIT clause, as this would produce incorrect results
2. Common Table Expressions (CTEs) and subqueries should NOT include a LIMIT clause
3. Queries whose primary purpose is to compute analytics, statistics, or aggregated values should NOT include a LIMIT clause

Special case for GROUP_CONCAT():
- When using GROUP_CONCAT(), apply a LIMIT of 8192 instead of 2048 to ensure more comprehensive results
- Example: SELECT GROUP_CONCAT(DISTINCT column) FROM table LIMIT 8192;

The LIMIT clause (maximum 2048) should only be applied when:
- Returning individual rows or records
- Displaying sample data
- Fetching specific records for display

Examples:
CORRECT (no LIMIT needed):
SELECT COUNT(*) FROM table;
SELECT category, COUNT(*) FROM table GROUP BY category;

CORRECT (GROUP_CONCAT with 8192 LIMIT):
SELECT GROUP_CONCAT(DISTINCT column) FROM table LIMIT 8192;

CORRECT (standard 2048 LIMIT):
SELECT * FROM table LIMIT 2048;
SELECT column1, column2 FROM table WHERE condition LIMIT 2048;

Your adherence to these rules is crucial for ensuring accurate results while preventing excessive data retrieval for row-level queries. When in doubt about whether a query should include a LIMIT clause, consider whether limiting the rows would affect the accuracy of the final result. Your adherence to these rules also ensures that we effectively manage the volume of data processed without unnecessarily restricting the computational scope of CTEs and subqueries.`;

export const SALESFORCE_INSTRUCTIONS = `
# SALESFORCE JSON QUERY GENERATOR

You will create a valid JSON query to query Salesforce data. This JSON query will be automatically converted to SOQL (Salesforce Object Query Language) syntax for execution.

## QUERY FORMAT AND STRUCTURE
You must follow this specific custom format:
\`\`\`
// JSON Query Format for Salesforce Objects
{
  // Required: The Salesforce object to query
  "object": "Account",
  
  // Required (if no aggregates): Fields to retrieve
  // Dot notation limited to 1 level deep: "Owner.Name" is valid, "Owner.Manager.Name" is not
  "fields": [
    "Id", 
    "Name", 
    "Owner.Name", 
    "BillingCity",
    // Functions can be used in field selections
    {"function": "DAY_ONLY", "arguments": ["CreatedDate"]},
    {"function": "CALENDAR_MONTH", "arguments": ["LastModifiedDate"]},
    // Nested functions are supported (functions as arguments to other functions)
    {"function": "FORMAT", "arguments": [
      {"function": "CALENDAR_MONTH", "arguments": ["CreatedDate"]},
      "'MMMM'"  // Note: String literals must be wrapped in single quotes
    ]}
  ],
  
  // Optional: Aggregate functions to perform
  "aggregates": [
    // Each aggregate requires function, field, and alias
    {"function": "COUNT", "field": "Id", "alias": "RecordCount"},
    {"function": "SUM", "field": "AnnualRevenue", "alias": "TotalRevenue"},
    // Functions can be used within aggregates - ALWAYS use the "arguments" array for nested functions, never "field"
    {"function": "COUNT", "field": {"function": "CALENDAR_MONTH", "arguments": ["CloseDate"]}, "alias": "MonthCount"},
    // Another correct example with nested functions
    {"function": "AVG", "field": {"function": "COUNT", "arguments": ["Id"]}, "alias": "AverageCount"}
    // Supported functions: COUNT, SUM, AVG, MIN, MAX
  ],
  
  // Optional: Filter conditions
  // Never include a non filterable field in a WHERE clause
  "where": {
    // Logical operator: AND or OR
    "condition": "AND",
    "filters": [
      // Simple condition (string values are automatically quoted in the resulting SOQL)
      {"field": "Industry", "operator": "=", "value": "Technology"},
      
      // Supported operators: =, !=, >, <, >=, <=, IN, NOT IN, LIKE, NOT LIKE
      {"field": "AnnualRevenue", "operator": ">", "value": 1000000},
      
      // Array values for IN/NOT IN operators
      {"field": "Type", "operator": "IN", "value": ["Customer", "Partner"]},
      
      // DateTime values must use this special object format (ISO 8601 format required)
      {"field": "CreatedDate", "operator": ">", "value": {"type": "datetime", "value": "2023-01-01T00:00:00Z"}},
      {"field": "CloseDate", "operator": "<", "value": {"type": "datetime", "value": "2023-12-31"}},
      
      // Salesforce date literals (for dynamic date ranges) also use the datetime type
      {"field": "CreatedDate", "operator": "=", "value": {"type": "datetime", "value": "TODAY"}},
      {"field": "CreatedDate", "operator": "=", "value": {"type": "datetime", "value": "LAST_N_DAYS:30"}},
      {"field": "CloseDate", "operator": ">", "value": {"type": "datetime", "value": "THIS_MONTH"}},
      
      // Functions can be used in field references (fields or WHERE conditions)
      {"field": {"function": "DAY_ONLY", "arguments": ["CreatedDate"]}, "operator": "=", "value": "2023-01-01"},
      
      // Functions can also be used as values in conditions
      {"field": "LastModifiedDate", "operator": ">", "value": {"type": "function", "function": "DAY_ONLY", "arguments": ["CreatedDate"]}},
      
      // Nested functions are supported in both fields and values
      {"field": {"function": "FORMAT", "arguments": [
        {"function": "CALENDAR_MONTH", "arguments": ["CreatedDate"]},
        "'MMMM'"
      ]}, "operator": "=", "value": "January"},
      
      {"field": "StageName", "operator": "=", "value": {"type": "function", "function": "FORMAT", "arguments": [
        {"function": "DAY_ONLY", "arguments": ["CloseDate"]},
        "'YYYY-MM-DD'"
      ]}},
      
      // Dot notation in filters (1 level max)
      {"field": "Owner.Department", "operator": "=", "value": "Sales"},
      
      // Nested condition group
      {
        "condition": "OR",
        "filters": [
          {"field": "BillingState", "operator": "=", "value": "CA"},
          {"field": "BillingState", "operator": "=", "value": "NY"}
        ]
      }
    ]
  },
  
  "parentFields": [{
    "relationship": "Account",
    "fields": [
      "Name", 
      "Industry",
      // Functions MUST NEVER be used in parent fields
    ]
  }],
  
  "relationships": [{
    "relationshipName": "Contacts",
    "fields": [
      "Id", 
      "FirstName", 
      "LastName",
      // Functions can also be used in relationship fields, including nested functions
      {"function": "CALENDAR_MONTH", "arguments": ["CreatedDate"]},
      {"function": "FORMAT", "arguments": [
        {"function": "CALENDAR_MONTH", "arguments": ["CreatedDate"]},
        "'MMMM'"
      ]}
    ],
    "where": {
      "condition": "AND",
      "filters": [
        { "field": "IsActive", "operator": "=", "value": true }
      ]
    }
  }],
  
  // Optional: Group by fields
  // IMPORTANT: A GROUP BY clause is MANDATORY when using aggregate functions (COUNT, SUM, etc.)
  // When using GROUP BY, you MUST include all non-aggregated fields in the GROUP BY clause
  // Example: If you SELECT Id, Name, COUNT(Opportunities), you must GROUP BY Id, Name
  // Can be simple array or advanced (ROLLUP/CUBE)
  "groupBy": [
    "Industry", 
    "Type",
    // Functions can be used in GROUP BY, including nested functions
    {"function": "CALENDAR_MONTH", "arguments": ["CloseDate"]},
    {"function": "FORMAT", "arguments": [
      {"function": "CALENDAR_YEAR", "arguments": ["CloseDate"]},
      "'YYYY'"
    ]}
  ],
  // OR advanced grouping:
  // "groupBy": {
  //   "type": "CUBE", // or "ROLLUP"
  //   "fields": ["Industry", "Type"]
  // },
  
  // Optional: Filter aggregate results
  "having": {
    "condition": "AND",
    "filters": [
      {"function": "COUNT", "field": "Id", "operator": ">", "value": 5},
      // For datetime values in HAVING clause, use the same object format
      {"function": "MAX", "field": "CloseDate", "operator": ">", "value": {"type": "datetime", "value": "2023-01-01T00:00:00Z"}},
      // Date literals can also be used in HAVING clause
      {"function": "MAX", "field": "CloseDate", "operator": "<", "value": {"type": "datetime", "value": "THIS_QUARTER"}}
    ]
  },
  
  // Optional: Sort results
  "orderBy": [
    {"field": "Name", "direction": "ASC"}, // direction: ASC (default) or DESC
    {"field": "AnnualRevenue", "direction": "DESC", "nulls": "LAST"}, // nulls: FIRST or LAST
    {"field": "SUM(AnnualRevenue)", "direction": "DESC", "nulls": "LAST"}, // for aggregates, never use the alias
    // Functions can also be used in ORDER BY clauses, including nested functions
    {"field": {"function": "DISTANCE", "arguments": ["Location__c", "GEOLOCATION(37.775, -122.418)"]}, "direction": "ASC"},
    {"field": {"function": "FORMAT", "arguments": [
      {"function": "CALENDAR_MONTH", "arguments": ["CreatedDate"]},
      "'MM'"  // Note: String literals must be wrapped in single quotes
    ]}, "direction": "ASC"}
  ],
  
  // Optional: Limit results (max 2000)
  "limit": 100,
  
  // Optional: Skip records
  "offset": 0
}
\`\`\`

## IMPORTANT GUIDELINES AND REQUIREMENTS

### Schema Restrictions
- All objects and fields must exist in the schema provided to you
- NEVER attempt to query an object that is not explicitly listed in the schema
- Do not use dot notation to access objects not referenced in the schema

### Query Format
- Always use the JSON format shown above - NEVER write raw SOQL or SQL
- Your JSON query will be automatically converted to Salesforce SOQL before execution
- One query must fulfill the entire user request

### Object Relationships
- For parent-to-child relations: use the "relationships" property (e.g., Account → Contacts)
- For child-to-parent relations: use the "parentFields" property (e.g., Contact → Account)

### Performance Best Practices
- Only request the fields needed for the task
- Use specific WHERE clauses to limit results
- Always add a LIMIT clause (default to 100 if not specified)
- Avoid unnecessary relationship queries
- Specify orderBy for clearer results

## WORKING WITH DATES AND DATETIME FIELDS

### Required Format for Date Values
- ALWAYS use the object-based format with \`"type": "datetime"\`
- NEVER use plain string values for dates or datetimes

### Three Options for Date Values

#### 1. ISO 8601 Format
- For dates: \`YYYY-MM-DD\`
- For datetimes: \`YYYY-MM-DDThh:mm:ssZ\`
- Example: \`{"type": "datetime", "value": "2023-01-01T00:00:00Z"}\`

#### 2. Salesforce Date Literals
- Simple literals: \`TODAY\`, \`YESTERDAY\`, \`TOMORROW\`, etc.
- Time periods: \`THIS_WEEK\`, \`LAST_MONTH\`, \`NEXT_QUARTER\`, etc.
- Parameterized: \`LAST_N_DAYS:7\`, \`NEXT_N_WEEKS:4\`, etc.
- Fiscal periods: \`THIS_FISCAL_QUARTER\`, \`NEXT_FISCAL_YEAR\`, etc.
- Example: \`{"type": "datetime", "value": "LAST_N_DAYS:30"}\`

##### Complete List of Date Literals

**Simple Literals**
- \`TODAY\` - Current day
- \`YESTERDAY\` - Day before current day
- \`TOMORROW\` - Day after current day
- \`LAST_WEEK\` - Week before current week
- \`THIS_WEEK\` - Current week
- \`NEXT_WEEK\` - Week after current week
- \`LAST_MONTH\` - Month before current month
- \`THIS_MONTH\` - Current month
- \`NEXT_MONTH\` - Month after current month
- \`LAST_90_DAYS\` - Last 90 days, including current day
- \`NEXT_90_DAYS\` - Next 90 days, including current day
- \`LAST_QUARTER\` - Quarter before current quarter
- \`THIS_QUARTER\` - Current quarter
- \`NEXT_QUARTER\` - Quarter after current quarter
- \`LAST_YEAR\` - Year before current year
- \`THIS_YEAR\` - Current year
- \`NEXT_YEAR\` - Year after current year

**Fiscal Literals**
- \`THIS_FISCAL_QUARTER\` - Current fiscal quarter
- \`LAST_FISCAL_QUARTER\` - Last fiscal quarter
- \`NEXT_FISCAL_QUARTER\` - Next fiscal quarter
- \`THIS_FISCAL_YEAR\` - Current fiscal year
- \`LAST_FISCAL_YEAR\` - Last fiscal year
- \`NEXT_FISCAL_YEAR\` - Next fiscal year

**Parameterized Literals**
- \`LAST_N_DAYS:n\` - Last n days, including current day (replace n with a number)
- \`NEXT_N_DAYS:n\` - Next n days, including current day
- \`LAST_N_WEEKS:n\` - Last n weeks, including current week
- \`NEXT_N_WEEKS:n\` - Next n weeks, including current week
- \`LAST_N_MONTHS:n\` - Last n months, including current month
- \`NEXT_N_MONTHS:n\` - Next n months, including current month
- \`LAST_N_QUARTERS:n\` - Last n quarters, including current quarter
- \`NEXT_N_QUARTERS:n\` - Next n quarters, including current quarter
- \`LAST_N_YEARS:n\` - Last n years, including current year
- \`NEXT_N_YEARS:n\` - Next n years, including current year
- \`LAST_N_FISCAL_QUARTERS:n\` - Last n fiscal quarters, including current fiscal quarter
- \`NEXT_N_FISCAL_QUARTERS:n\` - Next n fiscal quarters, including current fiscal quarter
- \`LAST_N_FISCAL_YEARS:n\` - Last n fiscal years, including current fiscal year
- \`NEXT_N_FISCAL_YEARS:n\` - Next n fiscal years, including current fiscal year

In parameterized literals, replace 'n' with the specific number you need (e.g., \`LAST_N_DAYS:7\` for last 7 days).

#### 3. Date Functions
- Extract or manipulate date components
- Used in fields: \`{"function": "DAY_ONLY", "arguments": ["CreatedDate"]}\`
- Used in values: \`{"type": "function", "function": "DAY_ONLY", "arguments": ["CreatedDate"]}\`
- Available functions: \`DAY_ONLY\`, \`CALENDAR_MONTH\`, etc. (see full list below)
- Nested functions supported: \`{"function": "FORMAT", "arguments": [{"function": "CALENDAR_MONTH", "arguments": ["CreatedDate"]}, "'MMMM'"]}\`

IMPORTANT: For date functions, ALWAYS use "arguments" array, NEVER use "field" property

### Working with Weeks in Date Fields

To group and aggregate by week, use ONLY these supported week functions:

| Function | Purpose | Example |
|----------|---------|---------|
| \`WEEK_IN_YEAR\` | Week number (1-52) in year | \`{"function": "WEEK_IN_YEAR", "arguments": ["CloseDate"]}\` |
| \`WEEK_IN_MONTH\` | Week number (1-5) in month | \`{"function": "WEEK_IN_MONTH", "arguments": ["CloseDate"]}\` |
| \`DAY_IN_WEEK\` | Day of week (1-7) | \`{"function": "DAY_IN_WEEK", "arguments": ["CloseDate"]}\` |

#### ⚠️ COMMON ERRORS TO AVOID
- The function \`CALENDAR_WEEK_IN_YEAR\` does NOT exist - always use \`WEEK_IN_YEAR\` instead
- \`AVG\` of \`COUNT\` is not allowed in SOQL for nested aggregates
- Nesting functions beyond 3 levels is not supported

#### Complete Example: Weekly Aggregation Query
\`\`\`json
{
  "object": "Opportunity",
  "aggregates": [
    {"function": "COUNT", "field": "Id", "alias": "OpportunityCount"},
    {"function": "SUM", "field": "Amount", "alias": "TotalAmount"}
  ],
  "where": {
    "condition": "AND",
    "filters": [
      {"field": "CreatedDate", "operator": ">=", "value": {"type": "datetime", "value": "LAST_N_DAYS:365"}}
    ]
  },
  "groupBy": [
    {"function": "WEEK_IN_YEAR", "arguments": ["CreatedDate"]},
    {"function": "CALENDAR_YEAR", "arguments": ["CreatedDate"]}
  ],
  "orderBy": [
    {"field": {"function": "CALENDAR_YEAR", "arguments": ["CreatedDate"]}, "direction": "ASC"},
    {"field": {"function": "WEEK_IN_YEAR", "arguments": ["CreatedDate"]}, "direction": "ASC"}
  ],
  "limit": 100
}
\`\`\`

### Function Usage Rules and Syntax

| Rule | Details |
|------|---------|
| Maximum nesting | 3 levels maximum for nested functions |
| Parent fields | Functions MUST NEVER be used in parent fields |
| Argument format | ALWAYS use "arguments" array, never "field" property for functions |
| String literals | Must be wrapped in single quotes IN THE JSON |

#### ✅ CORRECT vs ❌ INCORRECT Examples

Function arguments syntax:
- ✅ \`{"function": "COUNT", "arguments": ["Id"]}\`
- ❌ \`{"function": "COUNT", "field": "Id"}\`

Nested functions syntax:
- ✅ \`{"function": "AVG", "field": {"function": "COUNT", "arguments": ["Id"]}, "alias": "AverageCount"}\`
- ❌ \`{"function": "AVG", "field": {"function": "COUNT", "field": "Id"}, "alias": "AverageCount"}\`

String literals in functions:
- ✅ \`{"function": "FORMAT", "arguments": [{"function": "CALENDAR_MONTH", "arguments": ["CreatedDate"]}, "'MMMM'"]}\`
- ❌ \`{"function": "FORMAT", "arguments": [{"function": "CALENDAR_MONTH", "arguments": ["CreatedDate"]}, "MMMM"]}\`

**Note:** All non-datetime string values in WHERE conditions are automatically quoted in the resulting SOQL.


## SUPPORTED FUNCTIONS REFERENCE

This is an exhaustive list of all supported Salesforce functions:

| Category | Available Functions |
|----------|---------------------|
| **Date Functions** | \`DAY_ONLY\`, \`CALENDAR_MONTH\`, \`CALENDAR_QUARTER\`, \`CALENDAR_YEAR\`, \`DAY_IN_MONTH\`, \`DAY_IN_WEEK\`, \`DAY_IN_YEAR\`, \`FISCAL_MONTH\`, \`FISCAL_QUARTER\`, \`FISCAL_YEAR\`, \`HOUR_IN_DAY\`, \`WEEK_IN_MONTH\`, \`WEEK_IN_YEAR\` |
| **Formatting Functions** | \`FORMAT\`, \`CONVERT_TIMEZONE\` |
| **Math Functions** | \`ABS\`, \`CEILING\`, \`FLOOR\`, \`ROUND\`, \`MIN\`, \`MAX\`, \`COUNT\`, \`AVG\` |
| **Geolocation Functions** | \`DISTANCE\`, \`GEOLOCATION\` |
| **Logical Functions** | \`CASE\`, \`NULLVALUE\`, \`ISBLANK\` |
| **Other Functions** | \`CONVERTCURRENCY\`, \`TOLABEL\` |

⚠️ **IMPORTANT**: Never attempt to use a function that is not part of this list. It will result in an error. If you're unsure about a function, check the list above before using it.
`;

export function getGenericDialectInstructions(dialect: string): string {
  return `Provide a valid SQL query that is compatible with ${dialect}.
    Follow these guidelines:
    - always use the fully qualified table names (DATABASE_NAME.SCHEMA_NAME.TABLE_NAME). Never omit a part of it
    - when joining tables in SQL, it's crucial to consider all relevant columns in the join condition.
    - use caution when joining tables to prevent accidental data multiplication. It's usually a good idea to count distinct values when using joins.`;
}
