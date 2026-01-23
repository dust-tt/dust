# Snowflake

## Overview

The Snowflake tool lets you add to your agent the capability to browse your Snowflake data warehouse schema and execute read-only SQL queries. Agents can explore databases, schemas, tables, and run SELECT queries — all within the permissions of the authenticated role.

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
- **Role** — The Snowflake role to use (e.g., `ANALYST`). In personal mode, users can override this during their authentication.

Then choose the **Credentials Type**:

- **Personal** — Each user authenticates individually with their own Snowflake account. Queries run under each user's credentials, respecting their individual Snowflake permissions. Users can override the default role during their personal authentication.
- **Workspace** — The admin authenticates once with a service account. All workspace users share that connection — no individual authentication is required. The role and warehouse are fixed by the admin.

You will then be redirected to a Snowflake OAuth flow to validate the connection. Dust will verify that the provided role has access to the specified warehouse.

By default this tool is added to the Company data Space, so accessible in all the workspace.

## Usage

Once the tool has been configured by the admin as described before, it can be selected on any agent: in the Agent Builder, simply click on `Add Tool` and select Snowflake.

### With Personal credentials

When users use an agent with the Snowflake tool for the first time, they will need to click the `Connect` button to authenticate with their own Snowflake credentials. During this step, users can optionally override the default role with a different one (leave empty to use the workspace default). After connecting, they can click the `Retry` button to replay the agent answer.

### With Workspace credentials

No individual authentication is required. All agents use the admin's connected account when querying Snowflake. Users can start using the tool immediately after the admin completes setup.

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

## Snowflake Tool vs. Snowflake Connection

Dust offers two ways to connect agents to Snowflake: the **Snowflake Tool** (this page) and the [Snowflake Connection](/docs/snowflake). They serve different needs.

|  | Snowflake Tool | Snowflake Connection |
|--|----------------|---------------------|
| **What agents can access** | Everything the Snowflake role allows | Only the tables an admin explicitly selects in Dust |
| **Views support** | Yes (tables and views) | No (tables only) |
| **Query flexibility** | Free-form SQL — JOINs, CTEs, subqueries, aggregations | Structured table queries on individual tables |
| **Schema exploration** | Agents can browse databases, schemas, and tables on the fly | Agents only see the pre-selected tables |
| **Per-user permissions** | Yes (with personal credentials, each user's Snowflake role applies) | No — a single service account is shared |
| **Max rows per query** | 1,000 | 25,000 |
| **Authentication** | OAuth (personal or workspace) | Service account (password or key pair) |

### When to use the Snowflake Tool

- You want agents to **explore your warehouse freely** — discovering schemas, browsing tables, and writing flexible SQL.
- You need to query **views** (standard or materialized).
- You want **per-user access control** via personal credentials, so each user's Snowflake role determines what they can see.
- Your use case involves **complex queries** — JOINs across tables, CTEs, window functions, etc.

### When to use the Snowflake Connection

- You want **strict admin control** over which specific tables agents can access, independent of Snowflake roles.
- You need to retrieve **larger result sets** (up to 25,000 rows).
- You prefer a **simpler agent experience** — agents query known, pre-configured tables without needing to explore the schema first.

Both can coexist in the same workspace. For example, you might use a Connection for a well-defined reporting agent that queries specific tables, and the Tool for a data exploration agent that helps users investigate the warehouse ad hoc.

## Constraints

- Only **read-only** (SELECT) queries are supported. Write operations (INSERT, UPDATE, DELETE, MERGE, COPY) are blocked.
- Query results are limited to a maximum of **1000 rows** per execution.
- Multi-statement queries (containing semicolons) are not allowed.
- The tool respects Snowflake role-based access control — users can only access data their role permits.
