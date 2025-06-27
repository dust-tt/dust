# Conversation Attachments in Dust: A Comprehensive Guide

This document provides a detailed explanation of how conversation attachments, content fragments, content nodes, and file inclusion work in the Dust assistant platform.

## Table of Contents

1. [Overview](#overview)
2. [Terminology Clarification](#terminology-clarification)
3. [Core Concepts](#core-concepts)
4. [Architecture](#architecture)
5. [File Attachment Flow](#file-attachment-flow)
6. [Content Node Attachment Flow](#content-node-attachment-flow)
7. [Dynamic Actions: Emulated vs JIT](#dynamic-actions-emulated-vs-jit)
8. [Content Rendering](#content-rendering)
9. [XML Tags and Their Usage](#xml-tags-and-their-usage)
10. [MCP Server Integration](#mcp-server-integration)
11. [Database Schema](#database-schema)
12. [API Endpoints](#api-endpoints)
13. [Implementation Details](#implementation-details)
14. [Tool-Generated Files](#tool-generated-files)

## Overview

The conversation attachment system in Dust allows users to attach files and reference data source content within AI assistant conversations. The system supports three types of attachments:
1. **User-uploaded files** - Files directly uploaded to conversations
2. **Content nodes** - References to documents/folders from integrated data sources
3. **Tool-generated files** - Files created by actions during conversation execution

The system is designed to be flexible, efficient with context usage, and seamlessly integrated with the assistant's action capabilities.

## Terminology Clarification

Understanding the distinction between files, attachments, and content fragments is crucial:

### Files
- **Definition**: Physical files uploaded by users to conversations
- **Identifier**: `fileId` (e.g., `file_abc123`)
- **Storage**: Stored in Google Cloud Storage with "original" and "processed" versions
- **Use Case**: `useCase: "conversation"` for conversation uploads, `useCase: "tool_output"` for generated files

### Attachments
- **Definition**: General term encompassing both uploaded files AND content nodes from data sources
- **Types**: `ConversationFileType` (uploaded files) and `ConversationContentNodeType` (data source references)
- **Context**: Used when referring to any content attached to a conversation

### Content Fragments
- **Definition**: The unified abstraction layer that represents all attachments in the database
- **Purpose**: Provides a consistent interface for both files and content nodes
- **Storage**: `ContentFragmentModel` in the database
- **Identifier**: `contentFragmentId` (e.g., `cf_xyz789`)

## Core Concepts

### Content Fragments

Content fragments are the central abstraction for all attachments in conversations. They serve as a unified interface for both uploaded files and data source content nodes.

Key characteristics:
- Stored in the `ContentFragmentModel` database table
- Support versioning (`latest` or `superseded`)
- Can represent either file attachments or content node references
- Associated with messages in conversations

### Conversation Attachments

Attachments are the runtime representation of files and content nodes when they're being processed. There are two main types:

1. **ConversationFileType**: Represents uploaded files
   ```typescript
   type ConversationFileType = BaseConversationAttachmentType & {
     fileId: string;  // Reference to the uploaded file
   };
   ```

2. **ConversationContentNodeType**: Represents references to data source content
   ```typescript
   type ConversationContentNodeType = BaseConversationAttachmentType & {
     contentFragmentId: string;      // Reference to the content fragment
     nodeId: string;                 // ID within the data source
     nodeDataSourceViewId: string;   // Data source view reference
     nodeType: ContentNodeType;      // Type: document, folder, table
   };
   ```

Both types extend `BaseConversationAttachmentType` which includes:
- `title`: Display name of the attachment
- `contentType`: MIME type or Dust-specific content type
- `contentFragmentVersion`: Version status (`latest` or `superseded`)
- `snippet`: Preview text (max 256 characters)
- `generatedTables`: Array of table IDs for multi-sheet spreadsheets
- `isIncludable`: Whether full content can be retrieved
- `isQueryable`: Whether it contains tabular data that can be queried
- `isSearchable`: Whether content can be searched semantically
- `isExtractable`: Whether structured data can be extracted

### Content Nodes

Content nodes represent documents, folders, or other content from integrated data sources (e.g., Google Drive, Notion, Slack). They are not stored locally but are accessed on-demand through the Core API.

## Architecture

The attachment system follows a layered architecture:

```
┌─────────────────────┐
│   User Interface    │
├─────────────────────┤
│  Conversation API   │
├─────────────────────┤
│ Content Fragment    │
│    Resources        │
├─────────────────────┤
│   File Storage     │ │  Core API  │
│  (Google Cloud)    │ │(Data Sources)│
└────────────────────┘ └──────────────┘
```

## File Attachment Flow

1. **Upload Phase**:
   - User selects a file to attach
   - File is uploaded to `/api/w/[wId]/files` with `useCase: "conversation"`
   - File is stored in Google Cloud Storage with "original" and "processed" versions
   - A `FileResource` entry is created in the database

2. **Attachment Phase**:
   - When attached to a conversation, a `ContentFragmentResource` is created
   - The content fragment links to the file via `fileId`
   - A `Message` with type `content_fragment` is created in the conversation

3. **Storage Structure**:
   ```
   content_fragments/w/{workspaceId}/assistant/conversations/{conversationId}/content_fragment/{messageId}/{format}
   ```

## Content Node Attachment Flow

1. **Selection Phase**:
   - User selects content from a data source view (documents, folders, tables)
   - System validates access permissions through `DataSourceViewResource`

2. **Reference Creation**:
   - A `ContentFragmentResource` is created with:
     - `nodeId`: Unique identifier within the data source
     - `nodeDataSourceViewId`: Reference to the data source view
     - `nodeType`: Type of content (document, folder, table, etc.)

3. **Access Pattern**:
   - Content is fetched on-demand from the Core API
   - No local storage of the actual content
   - Real-time permission checks on each access

## Dynamic Actions: Emulated vs JIT

The system uses two distinct approaches for making actions available based on conversation attachments:

### Emulated Actions (Force-Injected)

These actions are pre-executed and their results are injected into the conversation before the model runs:

#### List Files Action
The only emulated action in the attachment system:
```typescript
{
  type: "conversation_list_files_action",
  files: ConversationAttachmentType[],
  step: -1  // Indicates this is an emulated action
}
```

**Characteristics:**
- Always created when attachments exist in the conversation
- Pre-executed before the model sees the conversation
- Results are injected at the beginning of the last agent turn
- Provides the model with a catalog of all available attachments
- Removed from `agentMessage.actions` after rendering

**Why emulated?** The model needs to know what files are available upfront to make informed decisions about which tools to use.

### JIT (Just-In-Time) Actions

These actions are made available as tools that the model can choose to call:

#### 1. Include File Action (conversation_include_file)
**Made available when:** Files are marked as `isIncludable`
- Retrieves full content of a specific attachment
- Enforces size limits: file must be < `contextSize / 4` tokens
- Returns text content directly or image URLs for vision models
- Transitioning to MCP server implementation (`conversation_files`)

#### 2. Query Tables Action (conversation_query_tables)
**Made available when:** Queryable files exist (CSV, Excel, etc.)
- Allows SQL-like queries across tabular data
- Supports multi-sheet spreadsheets
- Generates CSV output files and searchable section files
- Now implemented as MCP server (`query_tables`)

#### 3. Search Action (conversation_search)
**Made available when:** Searchable files exist
- Performs semantic search across attachment content
- Returns relevant snippets with citations
- Includes searchable folders (e.g., Notion pages, regular folders)
- Excludes multi-sheet spreadsheets from search

#### 4. Extract Data Action (conversation_extract)
**Made available when:** Extractable files exist
- Extracts structured data from documents
- Uses custom schemas for data extraction
- Supports various document formats
- Useful for parsing structured information from unstructured documents

### Implementation Flow

```typescript
// 1. Get emulated actions and JIT servers
const { emulatedActions, jitServers } = await getEmulatedActionsAndJITServers(auth, {
  agentMessage,
  conversation,
});

// 2. Prepend emulated actions to show their results
agentMessage.actions = emulatedActions.concat(agentMessage.actions);

// 3. Render conversation with emulated action results
const modelConversation = await renderConversationForModel(auth, {...});

// 4. Remove emulated actions (they're not real model calls)
agentMessage.actions = agentMessage.actions.filter(a => !emulatedActions.includes(a));

// 5. JIT servers are provided as available tools
```

## Content Rendering

The system has sophisticated logic for deciding when to render full content, snippets, or just metadata:

### Rendering Decision Matrix

#### 1. **Snippet Generation** (When files are uploaded/attached)
- **CSV Files**: Shows headers as snippet (max 256 characters)
- **Plain Text Files**: Takes first 256 characters as snippet
- **Images**: No snippet generation
- **Other Files**: LLM-based snippet generation is disabled (`ENABLE_LLM_SNIPPETS = false`)

#### 2. **Light Content Fragment Rendering** (In conversation context)
Used when rendering messages for the model context:
- **Default**: Renders only XML tag with metadata (no actual content)
- **Images with Vision Models**: Renders the actual image URL
- **Expired Content**: Shows expiration reason message
- **Purpose**: Saves context space by showing only metadata

Example of light rendering:
```xml
<content_fragment id="file_abc123" type="text/plain" title="report.txt" version="latest" />
```

#### 3. **Full Content Rendering** (Via include_file action)
Full content is included only when:
- The assistant explicitly calls the `include_file` action
- File size is less than `model.contextSize / 4` tokens
- The file is marked as `isIncludable`

If file is too large:
```
Error: File `fileId` has too many tokens to be included, 
use the `conversation_search` or `conversation_query_tables` actions instead.
```

#### 4. **UI Display Rendering**
In the user interface:
- Content fragments appear as **citation cards** with:
  - File icon based on content type
  - Title and source information
  - Preview thumbnail for images
- Does NOT show file contents directly in the conversation

### Rendering Flow Summary

```
1. User uploads file
   ├─→ Generate snippet (256 chars)
   ├─→ Store as ContentFragment
   └─→ Display as citation card in UI

2. Conversation context for model
   ├─→ Light rendering (metadata only)
   └─→ Exception: Full image URLs for vision models

3. Assistant uses include_file
   ├─→ Check token count
   ├─→ If < contextSize/4: Include full content
   └─→ If too large: Return error

4. Special content types
   ├─→ Expired: "Content no longer available" message
   ├─→ Images: Full URL only if model.supportsVision
   └─→ CSV: Headers as snippet, full data via query
```

### Key Constants
- **Snippet Length**: 256 characters
- **Include File Limit**: `contextSize / 4` tokens (e.g., 50K tokens for a 200K context model)
- **Token Margin**: 1024 tokens reserved for message formatting

### Rendering Functions

1. **`generateSnippet()`**: Creates preview snippets for files
2. **`renderLightContentFragmentForModel()`**: Minimal metadata rendering
3. **`renderFromAttachmentId()`**: Full content rendering for include_file
4. **`renderContentFragmentXml()`**: Formats content as XML for model consumption

This tiered rendering approach optimizes context usage while maintaining accessibility to full content when needed.

## XML Tags and Their Usage

The system uses specific XML tags for representing attachments and files in different contexts:

### 1. `<attachment>` Tag
Used for content fragments in conversation messages.

**Format with content:**
```xml
<attachment id="file_abc123" type="text/plain" title="report.txt" version="latest">
File content goes here...
</attachment>
```

**Format without content (light rendering):**
```xml
<attachment id="file_abc123" type="text/plain" title="report.txt" version="latest"/>
```

**Usage contexts:**
- **Light rendering**: `attach_[contentType]` (e.g., `attach_text/plain`) - metadata only
- **Full rendering**: `inject_[contentType]` (e.g., `inject_text/plain`) - includes content
- **Location**: Rendered by `renderContentFragmentXml()` function

### 2. `<file>` Tag
Used in the list files action to show available attachments.

**Format:**
```xml
<file id="file_abc123" name="report.txt" type="text/plain" 
      includable="true" queryable="false" searchable="true" 
      snippet="This is the beginning of the report..."/>
```

**Attributes:**
- `id`: File identifier (can be fileId or contentFragmentId)
- `name`: Display name (HTML escaped)
- `type`: Content type
- `includable/queryable/searchable`: Capability flags
- `snippet`: Preview text (optional, HTML escaped)

**Usage context:**
- Generated by `ConversationListFilesActionType.renderForMultiActionsModel()`
- Presented to the model when listing conversation attachments
- Used by the model to understand what files are available and their capabilities

### 3. Special File Tags for Generated Content
For JSON files generated by actions:

**Format:**
```xml
<file id="file_xyz789" type="application/json" title="query_results.json">
{
  "results": [
    {"id": 1, "name": "Item 1"},
    {"id": 2, "name": "Item 2"}
  ]
}
</file>
```

**Usage:**
- Generated by `getJSONFileAttachment()` helper
- Used to display generated JSON content inline in action results

### Identifier Usage in Tags

The system uses a consistent identifier strategy across different contexts:

1. **For uploaded files**: Uses `fileId` (e.g., `file_abc123`)
2. **For content nodes**: Uses `contentFragmentId` (e.g., `cf_xyz789`)
3. **For generated files**: Uses `fileId` of the generated file

The `conversationAttachmentId()` function ensures consistent ID usage:
```typescript
function conversationAttachmentId(attachment: ConversationAttachmentType): string {
  if (isConversationFileType(attachment)) {
    return attachment.fileId;
  }
  return attachment.contentFragmentId;
}
```

This ID is used consistently in:
- `<file>` tags in list files action
- `<attachment>` tags when rendering content
- Include file action parameters
- Search and query action references

## MCP Server Integration

The system is transitioning to use Model Context Protocol (MCP) servers for attachment operations:

### conversation_files MCP Server
Located at `/lib/actions/mcp_internal_actions/servers/conversation_files.ts`:

```typescript
server.tool(
  "include_file",
  "Include the content of a file from the conversation attachments",
  {
    fileId: z.string().describe("The fileId of the attachment to include")
  },
  async ({ fileId }) => {
    // Retrieves and returns file content
  }
);
```

Key features:
- Replaces legacy `conversation_include_file_action` when JIT actions are fully migrated
- Returns text content directly or image resources with MIME types
- Handles error cases gracefully
- Currently used alongside legacy actions during transition period

### Other MCP Servers for Attachments
- **query_tables**: Handles tabular data queries
- **file_generation**: Converts between file formats
- **search**: Performs semantic search (coming soon)

## Database Schema

### ContentFragmentModel
Primary table for storing content fragment metadata:
```sql
- id: ModelId (primary key)
- sId: string (unique identifier)
- fileId: string | null (reference to FileResource)
- nodeId: string | null (content node identifier)
- nodeDataSourceViewId: ModelId | null
- nodeType: ContentNodeType | null
- title: string
- contentType: SupportedContentFragmentType
- sourceUrl: string | null
- textBytes: number | null
- snippet: string | null
- version: ContentFragmentVersion
- expiredReason: ContentFragmentExpiredReason | null
- userContext fields (username, email, fullName, profilePictureUrl)
- workspaceId: ModelId
- createdAt, updatedAt: timestamps
```

### Relationships
- ContentFragment belongs to Message (1:1)
- Message belongs to Conversation
- ContentFragment optionally references FileResource
- ContentFragment optionally references DataSourceView

## API Endpoints

### File Upload
`POST /api/w/[wId]/files`
- Uploads files with `useCase: "conversation"`
- Returns file metadata including `fileId`

### Content Fragment Creation
`POST /api/w/[wId]/assistant/conversations/[cId]/content_fragment`
- Creates content fragments for uploaded files or content nodes
- Validates permissions and content types

### Content Retrieval
`GET /api/w/[wId]/assistant/conversations/[cId]/messages/[mId]/raw_content_fragment`
- Retrieves raw content of attachments
- Supports different formats (raw, text)

## Implementation Details

### File Processing
Files undergo processing based on their content type:
1. **Documents**: Text extraction and tokenization
2. **Images**: Thumbnail generation and metadata extraction
3. **Spreadsheets**: Table detection and structure extraction
4. **Code Files**: Syntax highlighting preparation

### Supported Content Types
The system supports 40+ file types including:
- Documents: PDF, DOCX, TXT, MD, RTF
- Images: PNG, JPG, GIF, SVG, WEBP
- Spreadsheets: CSV, XLSX, XLS
- Code: Various programming languages
- Data: JSON, XML, YAML

### Permission Model
Multi-level permission checks:
1. **Workspace Level**: User must have access to the workspace
2. **Data Source View Level**: For content nodes, validates view permissions
3. **Conversation Level**: Ensures user can access the conversation
4. **File Level**: Validates file ownership or conversation membership

### Performance Optimizations
1. **Lazy Loading**: Content node data fetched only when needed
2. **Token Counting**: Pre-calculates tokens to prevent context overflow
3. **Caching**: Temporary caching of frequently accessed content
4. **Size Limits**: Enforces reasonable size limits for inclusions

### Content Fragment Versioning
The system supports versioning of content fragments:
- When a new version is created (via `makeNewVersion()`), all previous versions are marked as `superseded`
- The latest version is always marked as `latest`
- Superseded content shows: "Content is outdated. Please refer to the latest version of this content."
- The `include_file` action handles superseded versions gracefully by returning the outdated message

### Error Handling
Comprehensive error handling for various scenarios:
- File not found or deleted
- Insufficient permissions
- Content too large for model context
- Data source disconnected or unavailable
- Malformed or corrupted files

This architecture provides a robust and flexible system for handling various types of attachments in AI assistant conversations, with clear separation of concerns and extensibility for future enhancements.

## Tool-Generated Files

An important aspect of the conversation attachment system is that tools and actions can generate files that automatically become part of the conversation attachments. This allows actions to produce outputs that can be referenced, queried, or included by subsequent actions.

### How Tools Generate Files

Tools can generate files through several mechanisms:

1. **Tables Query Action**: Generates CSV files from query results and section files for searchable content
2. **Dust App Run Action**: Produces CSV or plain text files based on application outputs
3. **MCP Actions**: Generate files through MCP tool calls
4. **File Generation MCP Server**: Dedicated server for file format conversion

### Generated File Structure

All generated files follow the `ActionGeneratedFileType` structure:
```typescript
type ActionGeneratedFileType = {
  fileId: string;
  title: string;
  contentType: SupportedFileContentType;
  snippet: string | null;
};
```

### File Generation Helpers

The system provides helper functions in `/lib/actions/action_file_helpers.ts`:

1. **generatePlainTextFile()**: Creates plain text files
   ```typescript
   await generatePlainTextFile(auth, {
     title: "output.txt",
     conversationId: conversation.sId,
     content: "File content here"
   });
   ```

2. **generateCSVFileAndSnippet()**: Creates CSV files with preview snippets
   ```typescript
   const { csvFile, csvSnippet } = await generateCSVFileAndSnippet(auth, {
     title: "results",
     conversationId: conversation.sId,
     results: csvRecords
   });
   ```

3. **generateSectionFile()**: Creates searchable section files
   ```typescript
   await generateSectionFile(auth, {
     title: "searchable_content",
     conversationId: conversation.sId,
     results: dataRecords,
     sectionColumnsPrefix: ["title", "category"]
   });
   ```

4. **generateJSONFileAndSnippet()**: Creates JSON files with preview snippets
   ```typescript
   const { jsonFile, jsonSnippet } = await generateJSONFileAndSnippet(auth, {
     title: "data.json",
     conversationId: conversation.sId,
     data: jsonObject
   });
   ```

### Storage and Integration

1. **File Storage**: Generated files are stored with `useCase: "tool_output"` and associated with the conversation
2. **Conversation Data Source**: Files are uploaded to the conversation's dedicated data source using `uploadFileToConversationDataSource()`
3. **Action Association**: Generated files are stored in the action's `generatedFiles` array

### Making Generated Files Available

The key mechanism is in the `listFiles()` function in `jit_utils.ts` which processes agent messages:
```typescript
if (isAgentMessageType(m)) {
  const generatedFiles = m.actions.flatMap((a) => a.getGeneratedFiles());
  
  for (const f of generatedFiles) {
    files.push({
      fileId: f.fileId,
      contentType: f.contentType,
      title: f.title,
      snippet: f.snippet,
      generatedTables: isQueryable ? [f.fileId] : [],
      contentFragmentVersion: "latest",
      isIncludable: true,
      isQueryable: isQueryableContentType(f.contentType),
      isSearchable: isSearchableContentType(f.contentType),
      isExtractable: isExtractableContentType(f.contentType),
    });
  }
}
```

Note: Generated files are always marked as `isIncludable: true` regardless of content type.

### File Generation Server (MCP)

The newer MCP approach includes a dedicated file generation server that can:
- Convert between 15+ file formats (PDF, DOCX, CSV, etc.)
- Accept input as file IDs, URLs, or direct content
- Return generated files as resources with appropriate MIME types

Example usage:
```typescript
server.tool("generate_file", {
  file_name: "report",
  input: "file_abc123", // or URL or content
  source_format: "md",
  output_format: "pdf"
});
```

### Key Benefits

1. **Automatic Integration**: Generated files automatically become part of the conversation context
2. **Capability Detection**: Files are automatically evaluated for include/query/search/extract capabilities
3. **Chaining**: Actions can generate files that subsequent actions can process
4. **Format Flexibility**: Support for various output formats based on action needs

This system enables powerful workflows where tools can produce intermediate results as files that other tools can then process, creating a flexible and composable architecture for complex tasks.

## Summary

The Dust conversation attachment system is a sophisticated three-layer architecture:

1. **Storage Layer**:
   - **Files**: Physical storage in Google Cloud (uploaded files) or ephemeral generation (tool outputs)
   - **Content Nodes**: References to external data sources, fetched on-demand

2. **Abstraction Layer**:
   - **Content Fragments**: Unified database representation for all attachments
   - Handles versioning, permissions, and metadata consistently

3. **Presentation Layer**:
   - **Light Rendering**: `<attachment>` tags with metadata only (saves context)
   - **Full Rendering**: Complete content inclusion via `include_file` action
   - **List Rendering**: `<file>` tags showing available attachments and capabilities

Key design principles:
- **Context Efficiency**: Default to metadata-only rendering, include full content only when needed
- **Unified Interface**: Content fragments abstract over different attachment types
- **Capability-Based**: Each attachment declares what actions it supports (include, query, search, extract)
- **Seamless Integration**: Tool-generated files automatically join the conversation context
- **Smart Action Delivery**: Essential context (file list) is emulated/injected, while optional tools are made available on-demand

This architecture enables users to work with diverse content sources while maintaining efficient use of model context windows and providing a consistent experience across different attachment types.