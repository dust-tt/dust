# Snowflake

> This tool uses personal credentials.
>
> This tool interacts with Snowflake using user accounts: it adapts to each user.

## Overview

The Snowflake tool lets you add to your agent the capability to browse your Snowflake data warehouse schema and execute read-only SQL queries. Agents can explore databases, schemas, tables, and run SELECT queries — all within the permissions of the authenticated user's role.

## Available Tools

**List Databases** — List all databases accessible to the authenticated Snowflake user.

**List Schemas** — List all schemas within a specified Snowflake database.

**List Tables** — List all tables and views within a specified Snowflake schema.

**Describe Table** — Get the schema (column names, types, and constraints) of a Snowflake table.

**Query** — Execute a read-only SQL query against Snowflake. Only SELECT queries are allowed. Returns up to 1000 rows per query.

## Admin: Setup in Snowflake

Before connecting to Dust, you need to create a Custom OAuth Security Integration in your Snowflake account. Run the following SQL commands as an **ACCOUNTADMIN**:

### 1. Create the OAuth Security Integration

```sql
CREATE SECURITY INTEGRATION dust_oauth
  TYPE = OAUTH
  ENABLED = TRUE
  OAUTH_CLIENT = CUSTOM
  OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'
  OAUTH_REDIRECT_URI = 'https://dust.tt/oauth/snowflake/finalize'
  OAUTH_ISSUE_REFRESH_TOKENS = TRUE
  OAUTH_REFRESH_TOKEN_VALIDITY = 7776000;
```

> If your workspace is on the EU region, use `https://eu.dust.tt/oauth/snowflake/finalize` as the redirect URI instead.

### 2. Get the Client ID and Client Secret

```sql
SELECT SYSTEM$SHOW_OAUTH_CLIENT_SECRETS('DUST_OAUTH');
```

This returns a JSON object with `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET`. Copy these values for the next step.

### 3. (Optional) Grant the integration to specific roles

```sql
GRANT USAGE ON INTEGRATION dust_oauth TO ROLE <role_name>;
```

## Admin: Setup in Dust

Go to Spaces > Tools in your Dust workspace, click `Add Tools`, and select Snowflake.

Fill in the following fields:

- **Account Identifier** — Your Snowflake account identifier (e.g., `abc123.us-east-1` or `myorg-myaccount`).
- **Client ID** — The `OAUTH_CLIENT_ID` from the security integration.
- **Client Secret** — The `OAUTH_CLIENT_SECRET` from the security integration.
- **Warehouse** — The warehouse to use for query execution (e.g., `COMPUTE_WH`). This warehouse is shared for all users.
- **Role** — The default Snowflake role for users (e.g., `ANALYST`). Users can override this during their personal authentication.

You will then be redirected to a Snowflake OAuth flow to validate the connection. Dust will verify that the provided role has access to the specified warehouse.

By default this tool is added to the Company data Space, so accessible in all the workspace.

## Usage

Once the tool has been configured by the admin as described before, it can be selected on any agent: in the Agent Builder, simply click on `Add Tool` and select Snowflake.

When users use an agent with the Snowflake tool for the first time, they will need to click the `Connect` button to authenticate with their own Snowflake credentials. During this step, users can optionally override the default role with a different one (leave empty to use the workspace default). After connecting, they can click the `Retry` button to replay the agent answer.

## Adding Snowflake Tools to Agents

Snowflake tools integrate into agents through the agent builder with no additional configuration needed.

Include in agent instructions context about which databases or schemas the agent should focus on. Example:

```
Our data warehouse is organized as follows:
- ANALYTICS database: contains our main reporting tables
- RAW database: contains raw ingested data

When querying Snowflake:
- Always start by exploring the schema using list_databases, list_schemas, list_tables, and describe_table before writing queries.
- Only use SELECT queries. Write operations are not supported.
- Prefer specific columns over SELECT * for better performance.
- Results are limited to 1000 rows per query.
```

## What can I ask?

**Explore your data warehouse**

- "What databases do I have access to in Snowflake?"
- "List all tables in the ANALYTICS.PUBLIC schema."
- "Describe the columns and types of the USERS table."

**Query your data**

- "How many active users signed up last month? Check the ANALYTICS.PUBLIC.USERS table."
- "Show me the top 10 customers by revenue from the SALES table."
- "What are the most recent orders in our system?"

**Analysis and reporting**

- "Compare this month's revenue to last month using our ANALYTICS tables."
- "Find all users who haven't logged in for 30 days."
- "Summarize the distribution of order statuses in the ORDERS table."

## Constraints

- Only **read-only** (SELECT) queries are supported. Write operations (INSERT, UPDATE, DELETE, MERGE, COPY) are blocked.
- Query results are limited to a maximum of **1000 rows** per execution.
- Multi-statement queries (containing semicolons) are not allowed.
- The tool respects Snowflake role-based access control — users can only access data their role permits.
