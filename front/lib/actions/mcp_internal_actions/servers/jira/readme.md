# JIRA MCP Server Setup Guide

## Overview

This guide explains how to set up and configure the JIRA Model Context Protocol (MCP) server for comprehensive JIRA ticket management. The MCP server provides full CRUD operations for JIRA tickets, including creation, updates, comments, and workflow transitions.

## Table of Contents

1. [JIRA OAuth App Setup](#jira-oauth-app-setup)
2. [Code Configuration](#code-configuration)
3. [Available Tools](#available-tools)
4. [API Reference](#api-reference)
5. [Troubleshooting](#troubleshooting)

---

## JIRA OAuth App Setup

### Prerequisites

- JIRA Cloud instance
- Atlassian Developer account
- Admin access to your JIRA instance
- jira_tool feature flag in Dust set to `on`

### Step 1: Create an OAuth 2.0 App

1. **Go to Atlassian Developer Console**

   - Visit: https://developer.atlassian.com/console/myapps/
   - Sign in with your Atlassian account

2. **Create a New App**

   - Click "Create" → "OAuth 2.0 integration"
   - Name your app (e.g., "JIRA MCP Integration")
   - Select your workspace

3. **Configure OAuth Settings**

   - **Authorization callback URLs**: Add your application's callback URL
   - **Scopes**: Add the following scopes:
     ```
     read:jira-work
     read:jira-user
     read:issue:jira
     read:issue.property:jira
     read:project:jira
     read:user:jira
     write:jira-work
     ```

4. **Get Credentials**
   - Note down your **Client ID** and **Client Secret**
   - These will be used in your environment configuration

### Step 2: OAuth 2.0 Flow URLs

- **Authorization URL**: `https://auth.atlassian.com/authorize?audience=api.atlassian.com`
- **Token URL**: `https://auth.atlassian.com/oauth/token`
- **Accessible Resources URL**: `https://api.atlassian.com/oauth/token/accessible-resources`

### Step 3: Environment Variables in Dust

Set the following environment variables in your application:

```bash
OAUTH_JIRA_CLIENT_ID=your_client_id_here
OAUTH_JIRA_CLIENT_SECRET=your_client_secret_here
```

---

## Code Configuration

### File Structure

The JIRA MCP server is organized in the following files:

```
front/lib/actions/mcp_internal_actions/servers/jira/
├── server.ts              # Main MCP server with tool definitions
├── jira_api_helper.ts     # JIRA API interaction functions
├── jira_utils.ts          # Authentication and utility functions
└── ...
```

### Authentication Flow

1. **OAuth Token Exchange**: The system exchanges authorization codes for access tokens
2. **CloudID Resolution**: Uses the access token to fetch accessible JIRA resources
3. **Base URL Construction**: Constructs API URLs using CloudID format:
   ```
   https://api.atlassian.com/ex/jira/{cloudId}
   ```

### Key Configuration Details

#### Server Definition (`server.ts`)

```typescript
const serverInfo: InternalMCPServerDefinitionType = {
  name: "jira",
  version: "2.0.0",
  description:
    "Comprehensive JIRA integration providing full ticket management capabilities",
  authorization: {
    provider: "jira" as const,
    supported_use_cases: ["platform_actions"] as const,
  },
  icon: "JiraLogo",
  documentationUrl:
    "https://developer.atlassian.com/server/jira/platform/rest/v10007/intro/",
};
```

#### Authentication Wrapper (`jira_utils.ts`)

The `withAuth` function handles:

- Access token validation
- CloudID resolution from accessible resources
- Base URL construction
- Error handling

#### API Helper Functions (`jira_api_helper.ts`)

Contains all JIRA REST API interaction functions with proper error handling and TypeScript types.

---

## Available Tools

The JIRA MCP server provides 7 comprehensive tools for ticket management:

### 1. `get_tickets` (Read Single Ticket)

**Description**: Retrieves a single JIRA ticket by its key.

**Parameters**:

- `ticketKey` (string): The JIRA ticket key (e.g., 'PROJ-123')

**Example**:

```json
{
  "ticketKey": "PROJ-123"
}
```

### 2. `list_tickets` (Search/List Tickets)

**Description**: Lists JIRA tickets based on a JQL query with pagination support.

**Parameters**:

- `jql` (string, optional): JQL query to filter tickets (default: "\*")
- `startAt` (number, optional): Starting index for pagination (default: 0)
- `maxResults` (number, optional): Maximum number of results (default: 50)

**Example**:

```json
{
  "jql": "project = MYPROJECT AND status = Open",
  "startAt": 0,
  "maxResults": 25
}
```

### 3. `create_issue` (Create New Ticket)

**Description**: Creates a new JIRA issue with the specified details.

**Parameters**:

- `projectKey` (string): The JIRA project key (e.g., 'PROJ')
- `summary` (string): Brief summary of the issue
- `description` (string, optional): Detailed description of the issue
- `issueType` (string): Issue type (e.g., 'Bug', 'Task', 'Story')
- `priority` (string, optional): Priority (e.g., 'High', 'Medium', 'Low')
- `assigneeAccountId` (string, optional): Account ID of the assignee
- `labels` (array, optional): Array of labels to add to the issue

**Example**:

```json
{
  "projectKey": "PROJ",
  "summary": "Fix login issue",
  "description": "Users cannot log in with SSO",
  "issueType": "Bug",
  "priority": "High",
  "labels": ["authentication", "urgent"]
}
```

### 4. `update_issue` (Update Existing Ticket)

**Description**: Updates an existing JIRA issue with new field values.

**Parameters**:

- `ticketKey` (string): The JIRA ticket key (e.g., 'PROJ-123')
- `summary` (string, optional): Updated summary of the issue
- `description` (string, optional): Updated description of the issue
- `priority` (string, optional): Updated priority
- `assigneeAccountId` (string, optional): Account ID of the new assignee
- `labels` (array, optional): Updated array of labels

**Example**:

```json
{
  "ticketKey": "PROJ-123",
  "summary": "Updated: Fix critical login issue",
  "priority": "Critical",
  "assigneeAccountId": "5b10a2844c20165700ede21g"
}
```

### 5. `add_comment` (Add Comment)

**Description**: Adds a comment to an existing JIRA issue.

**Parameters**:

- `ticketKey` (string): The JIRA ticket key (e.g., 'PROJ-123')
- `comment` (string): The comment text to add
- `visibilityType` (enum, optional): Visibility restriction type ('group' or 'role')
- `visibilityValue` (string, optional): Group or role name for visibility restriction

**Example**:

```json
{
  "ticketKey": "PROJ-123",
  "comment": "This issue has been reproduced in the staging environment.",
  "visibilityType": "group",
  "visibilityValue": "developers"
}
```

### 6. `get_transitions` (Get Available Transitions)

**Description**: Gets available transitions for a JIRA issue based on its current status and workflow.

**Parameters**:

- `ticketKey` (string): The JIRA ticket key (e.g., 'PROJ-123')

**Example**:

```json
{
  "ticketKey": "PROJ-123"
}
```

**Response Example**:

```json
{
  "transitions": [
    {
      "id": "21",
      "name": "In Progress",
      "to": {
        "id": "3",
        "name": "In Progress"
      }
    },
    {
      "id": "31",
      "name": "Done",
      "to": {
        "id": "10001",
        "name": "Done"
      }
    }
  ]
}
```

### 7. `transition_issue` (Change Status)

**Description**: Transitions a JIRA issue to a different status/workflow state.

**Parameters**:

- `ticketKey` (string): The JIRA ticket key (e.g., 'PROJ-123')
- `transitionId` (string): The ID of the transition to perform
- `comment` (string, optional): Optional comment to add during transition

**Example**:

```json
{
  "ticketKey": "PROJ-123",
  "transitionId": "21",
  "comment": "Moving to In Progress as development has started"
}
```

---

## API Reference

### Base URL Format

All API calls use the CloudID format:

```
https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/
```

### Authentication

- **Type**: OAuth 2.0 Bearer Token
- **Header**: `Authorization: Bearer {access_token}`

### Endpoints Used

| Operation        | Method | Endpoint                                   |
| ---------------- | ------ | ------------------------------------------ |
| Get Issue        | GET    | `/rest/api/3/issue/{issueKey}`             |
| Search Issues    | GET    | `/rest/api/3/search`                       |
| Create Issue     | POST   | `/rest/api/3/issue`                        |
| Update Issue     | PUT    | `/rest/api/3/issue/{issueKey}`             |
| Add Comment      | POST   | `/rest/api/3/issue/{issueKey}/comment`     |
| Get Transitions  | GET    | `/rest/api/3/issue/{issueKey}/transitions` |
| Transition Issue | POST   | `/rest/api/3/issue/{issueKey}/transitions` |

### Error Handling

The server includes comprehensive error handling:

- OAuth token validation
- HTTP status code checking
- Detailed error messages with context
- Proper error logging

---

## Troubleshooting

### Common Issues

1. **OAuth Token Issues**

   - Verify `OAUTH_JIRA_CLIENT_ID` and `OAUTH_JIRA_CLIENT_SECRET` are set
   - Check that OAuth scopes include all required permissions
   - Ensure callback URLs are correctly configured

2. **CloudID Resolution Failures**

   - Verify the access token has permission to access JIRA resources
   - Check that the user has access to at least one JIRA instance
   - Confirm the token hasn't expired

3. **API Permission Errors**

   - Ensure the user has appropriate project permissions
   - Verify issue-level security settings if applicable
   - Check that the project key and issue types exist

4. **Transition Errors**
   - Use `get_transitions` to verify available transitions
   - Ensure the user has permission to perform the transition
   - Check workflow configuration in JIRA

### Debug Steps

1. **Check Server Logs**: Look for detailed error messages in the application logs
2. **Verify OAuth Setup**: Test the OAuth flow manually
3. **Test API Endpoints**: Use tools like Postman to test individual API calls
4. **Check JIRA Configuration**: Verify project settings and permissions in JIRA

### Support Resources

- **JIRA REST API Documentation**: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
- **OAuth 2.0 (3LO) Guide**: https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
- **Atlassian Developer Community**: https://community.developer.atlassian.com/

---

## Version History

- **v2.0.0**: Added create, update, comment, and transition capabilities
- **v1.0.0**: Initial release with read-only functionality (get_tickets, list_tickets)

---

_Last updated: [Current Date]_
_Server Version: 2.0.0_
