# Monday.com MCP Server Setup Guide

## Overview

This guide explains how to set up and configure the Monday.com Model Context Protocol (MCP) server for CRM-like operations. The MCP server provides comprehensive Monday.com board and item management capabilities including creation, updates, and search functionality.

## Table of Contents

1. [Monday OAuth App Setup](#monday-oauth-app-setup)
2. [Code Configuration](#code-configuration)
3. [Available Tools](#available-tools)
4. [API Reference](#api-reference)
5. [Column Value Formats](#column-value-formats)
6. [Troubleshooting](#troubleshooting)

---

## Monday OAuth App Setup

### Prerequisites

- Monday.com account with admin access
- monday_tool feature flag in Dust set to `on`

### Step 1: Create an OAuth App

1. **Go to Monday.com Developer Center**
   - Visit: https://developers.monday.com/
   - Sign in with your Monday.com account

2. **Create a New App**
   - Go to "My Apps" section
   - Click "Create App"
   - Choose "Build an app" option
   - Give your app a name (e.g., "Dust Integration")

3. **Configure OAuth Settings**
   - In your app settings, go to "OAuth & Permissions"
   - Add redirect URL: `https://[your-dust-domain]/oauth/monday/finalize`
   - Add the following scopes:
     ```
     me:read
     boards:read
     boards:write
     updates:read
     updates:write
     users:read
     workspaces:read
     ```

4. **Get Credentials**
   - Note down your **Client ID** and **Client Secret**
   - These will be used in your environment configuration

### Step 2: OAuth 2.0 Flow URLs

- **Authorization URL**: `https://auth.monday.com/oauth2/authorize`
- **Token URL**: `https://auth.monday.com/oauth2/token`

### Step 3: Environment Variables in Dust

Set the following environment variables in your application:

```bash
OAUTH_MONDAY_CLIENT_ID=your_client_id_here
OAUTH_MONDAY_CLIENT_SECRET=your_client_secret_here
```

---

## Code Configuration

### File Structure

The Monday.com MCP server is organized in the following files:

```
front/lib/actions/mcp_internal_actions/servers/monday/
├── server.ts              # Main MCP server with tool definitions
├── monday_api_helper.ts   # Monday.com GraphQL API interaction functions
├── monday_utils.ts        # Authentication and utility functions
└── readme.md             # This documentation file
```

### Authentication Flow

1. **OAuth Token Exchange**: The system exchanges authorization codes for access tokens
2. **GraphQL API Access**: Uses the access token to make authenticated requests to Monday.com's GraphQL API
3. **API Endpoint**: All requests go to `https://api.monday.com/v2`

### Key Configuration Details

#### Server Definition (`server.ts`)

```typescript
const serverInfo: InternalMCPServerDefinitionType = {
  name: "monday",
  version: "1.0.0",
  description:
    "Monday.com integration providing CRM-like operations for boards, items, and updates.",
  authorization: {
    provider: "monday" as const,
    supported_use_cases: ["platform_actions"] as const,
  },
  icon: "MondayLogo",
  documentationUrl: "https://developer.monday.com/api-reference/docs/introduction-to-graphql",
};
```

---

## Available Tools

The Monday.com MCP server provides 8 comprehensive tools for board and item management:

### 1. `get_boards` (List All Boards)

**Description**: Lists all accessible boards in the Monday.com workspace.

**Parameters**:
- `limit` (number, optional): Maximum number of boards to return (default: 50)

**Example**:
```json
{
  "limit": 25
}
```

### 2. `get_board_items` (Get Items from Board)

**Description**: Retrieves items from a specific Monday.com board.

**Parameters**:
- `boardId` (string): The board ID to retrieve items from
- `limit` (number, optional): Maximum number of items to return (default: 50)

**Example**:
```json
{
  "boardId": "1234567890",
  "limit": 30
}
```

### 3. `get_item_details` (Get Single Item)

**Description**: Retrieves detailed information about a specific Monday.com item.

**Parameters**:
- `itemId` (string): The item ID to retrieve details for

**Example**:
```json
{
  "itemId": "9876543210"
}
```

### 4. `search_items` (Search Items)

**Description**: Searches for items across Monday.com boards or within a specific board.

**Parameters**:
- `searchQuery` (string): The search query to find items
- `boardId` (string, optional): Optional board ID to limit search to a specific board
- `limit` (number, optional): Maximum number of items to return (default: 50)

**Example**:
```json
{
  "searchQuery": "Q1 campaign",
  "boardId": "1234567890",
  "limit": 20
}
```

### 5. `create_item` (Create New Item)

**Description**: Creates a new item in a Monday.com board.

**Parameters**:
- `boardId` (string): The board ID to create the item in
- `itemName` (string): The name of the new item
- `groupId` (string, optional): Optional group ID to add the item to
- `columnValues` (object, optional): Optional column values as a JSON object

**Example**:
```json
{
  "boardId": "1234567890",
  "itemName": "New Marketing Campaign",
  "groupId": "topics",
  "columnValues": {
    "status": "Working on it",
    "date": "2024-02-15",
    "person": {"personsAndTeams": [{"id": 123456, "kind": "person"}]}
  }
}
```

### 6. `update_item` (Update Item)

**Description**: Updates column values of an existing Monday.com item.

**Parameters**:
- `itemId` (string): The item ID to update
- `columnValues` (object): Column values to update as a JSON object

**Example**:
```json
{
  "itemId": "9876543210",
  "columnValues": {
    "status": "Done",
    "priority": "High",
    "text": "Updated description"
  }
}
```

### 7. `create_update` (Add Comment)

**Description**: Adds an update (comment) to a Monday.com item.

**Parameters**:
- `itemId` (string): The item ID to add the update to
- `body` (string): The content of the update/comment

**Example**:
```json
{
  "itemId": "9876543210",
  "body": "Meeting scheduled with client for next Tuesday"
}
```

### 8. `delete_item` (Delete Item)

**Description**: Deletes an item from Monday.com (requires high stakes confirmation).

**Parameters**:
- `itemId` (string): The item ID to delete

**Example**:
```json
{
  "itemId": "9876543210"
}
```

---

## API Reference

### GraphQL Endpoint

All API calls are made to:
```
POST https://api.monday.com/v2
```

### Authentication

- **Type**: OAuth 2.0 Bearer Token
- **Header**: `Authorization: Bearer {access_token}`

### Query Structure

All requests use GraphQL queries or mutations. Example structure:

```graphql
query {
  boards(limit: 10) {
    id
    name
    description
    state
  }
}
```

---

## Column Value Formats

When updating column values in Monday.com, different column types require specific JSON formats:

### Text Columns
```json
{
  "text_column": "Simple text value"
}
```

### Status Columns
```json
{
  "status": "Done"
}
```
Or with index:
```json
{
  "status": {"index": 1}
}
```

### Date Columns
```json
{
  "date": "2024-02-15"
}
```

### Person Columns
```json
{
  "person": {
    "personsAndTeams": [
      {"id": 123456, "kind": "person"}
    ]
  }
}
```

### Number Columns
```json
{
  "numbers": 42
}
```

### Dropdown Columns
```json
{
  "dropdown": {"labels": ["Option 1"]}
}
```

---

## Troubleshooting

### Common Issues

1. **OAuth Token Issues**
   - Verify `OAUTH_MONDAY_CLIENT_ID` and `OAUTH_MONDAY_CLIENT_SECRET` are set
   - Check that OAuth scopes include all required permissions
   - Ensure redirect URLs are correctly configured

2. **GraphQL Errors**
   - Check that board IDs and item IDs are valid
   - Verify column names match exactly (case-sensitive)
   - Ensure column value formats match the column type

3. **Permission Errors**
   - Verify the user has access to the requested boards
   - Check that the OAuth app has the necessary scopes
   - Ensure the monday_tool feature flag is enabled

### Debug Steps

1. **Check Server Logs**: Look for detailed error messages in the application logs
2. **Verify OAuth Setup**: Test the OAuth flow manually
3. **Test GraphQL Queries**: Use Monday.com's API playground to test queries
4. **Check Column Types**: Use `get_board_items` to see actual column structures

### Support Resources

- **Monday.com API Documentation**: https://developer.monday.com/api-reference/docs/introduction-to-graphql
- **GraphQL Playground**: https://api.monday.com/v2/api-playground
- **OAuth Setup Guide**: https://developer.monday.com/apps/docs/oauth

---

## Version History

- **v1.0.0**: Initial release with full CRUD operations for boards and items

---

_Last updated: January 2025_
_Server Version: 1.0.0_