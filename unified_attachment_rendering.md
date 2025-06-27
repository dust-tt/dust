# Unified Attachment Rendering Implementation

## Overview

This document describes the implementation of a unified attachment rendering system for Dust conversations. The goal was to consolidate the various rendering paths into a single, consistent approach.

## Key Changes

### 1. Exported Capability Check Functions

In `/front/lib/api/assistant/jit_utils.ts`, exported the following functions that were previously internal:
- `isConversationIncludableFileContentType()`
- `isQueryableContentType()`
- `isSearchableContentType()`
- `isExtractableContentType()`

These functions are now available for use in the unified rendering system.

### 2. Added Unified Rendering System

In `/front/lib/api/conversation/files.ts`, added:

#### Enums and Types
```typescript
export enum AttachmentRenderMode {
  METADATA_ONLY = "metadata_only", // Just the tag, no content
  WITH_SNIPPET = "with_snippet",    // Tag with snippet attribute
  WITH_CONTENT = "with_content",    // Tag with full content inside
}

export interface AttachmentRenderOptions {
  mode: AttachmentRenderMode;
  includeCapabilities?: boolean;  // Show includable/queryable/searchable flags
  excludeImages?: boolean;        // For vision model handling
  maxSnippetLength?: number;      // Default: 256
}
```

#### Conversion Function
```typescript
export function contentFragmentToConversationAttachment(
  auth: Authenticator,
  fragment: ContentFragmentType,
  generatedTables: string[] = []
): ConversationAttachmentType
```

This function converts a `ContentFragmentType` (database model) to a `ConversationAttachmentType` (runtime representation), providing a unified interface for all attachments.

#### Unified Rendering Function
```typescript
export function renderAttachment(
  attachment: ConversationAttachmentType,
  options: AttachmentRenderOptions
): string
```

This is the single entry point for rendering attachments with consistent formatting. It's a pure synchronous function that focuses solely on rendering.

#### Content Fetching Function
```typescript
export async function fetchAttachmentContent(
  auth: Authenticator,
  attachment: ConversationAttachmentType,
  model: ModelConfigurationType,
  options: { excludeImages?: boolean } = {}
): Promise<Result<string, Error>>
```

This separate async function handles fetching content when needed for `WITH_CONTENT` mode, maintaining separation of concerns between rendering and data fetching.

### 3. Updated ConversationListFilesActionType

In `/front/lib/actions/conversation/list_files.ts`:
- Changed from `<file>` tags to `<attachment>` tags for consistency
- Added the `extractable` attribute to match other capability flags
- Updated to use the unified `renderAttachment()` function with `AttachmentRenderMode.WITH_SNIPPET`
- The method now receives auth, conversation, and model parameters to support the unified renderer

### 4. Updated renderLightContentFragmentForModel

In `/front/lib/resources/content_fragment_resource.ts`:
- Converted to use the unified rendering system
- Now imports from the new `@app/lib/api/conversation/files` module
- Uses `contentFragmentToConversationAttachment()` for conversion
- Uses `renderAttachment()` with appropriate modes

### 5. Resolved Dependency Cycle

To avoid circular dependencies, the code was reorganized into separate modules:
- Created `/front/lib/types/conversation_attachments.ts` with all attachment types and type guards
- Created `/front/lib/api/conversation/files.ts` with all rendering helpers
- Created `/front/lib/api/files/content_helpers.ts` with file content retrieval functions
- The `list_files.ts` file now re-exports types for backward compatibility
- Removed circular imports between `content_fragment_resource.ts` and `files.ts`

## Consistent Tag Format

All attachments now use the same `<attachment>` tag format:

```xml
<attachment 
  id="file_abc123" 
  type="text/plain" 
  title="report.txt" 
  version="latest"
  includable="true"
  queryable="false" 
  searchable="true"
  extractable="false"
  snippet="First 256 chars..."
/>
```

Or with content:
```xml
<attachment id="file_abc123" type="text/plain" title="report.txt" version="latest">
File content goes here...
</attachment>
```

## Benefits

1. **Single source of truth**: All attachment rendering logic is centralized
2. **Consistent output**: Same tag format everywhere
3. **Flexible rendering**: Easy to control what information is included via options
4. **Better maintainability**: Changes only need to happen in one place
5. **Type safety**: Using discriminated unions ensures proper handling
6. **Separation of concerns**: Rendering logic is separated from data fetching
7. **Pure functions**: `renderAttachment` is a pure function, making it easy to test and reason about
8. **Composability**: The synchronous renderer can be used in any context without async complexity

## Implementation Details

The `renderAttachment` function is now used in both:
- `ConversationListFilesActionType.renderForMultiActionsModel()` - for listing files with capabilities
- `renderLightContentFragmentForModel()` - for rendering content fragments in conversations

## Future Improvements

1. **Complete Migration**: Update all remaining rendering paths to use the unified system
2. **Remove Legacy Code**: Clean up old rendering functions once migration is complete
3. **Performance Optimization**: Consider caching rendered attachments to avoid re-rendering