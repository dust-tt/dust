# Notion Tree Mapper

## Overview

The Notion Tree Mapper is a powerful utility for efficiently mapping and visualizing the hierarchical structure of a Notion workspace. This documentation explains what the script does, how it works, and how to use it.

## Purpose

Notion workspaces can become complex hierarchical structures with many deeply nested pages and databases. Understanding this structure is valuable for:

- Visualization of workspace organization
- Data migration planning
- Content auditing
- Structural analysis
- Connectivity mapping

This script creates a complete map of your Notion workspace, showing the parent-child relationships between all pages and databases.

## How It Works

The script uses a sophisticated dual-discovery approach to comprehensively map a Notion workspace:

1. **Search Discovery**: Uses Notion's search API to discover pages and databases across the workspace, regardless of their position in the hierarchy.

2. **Traversal Discovery**: For each discovered page, it crawls through child blocks to find linked pages and databases, establishing parent-child relationships.

3. **Tree Construction**: As pages are discovered, they're organized into a tree structure that represents the entire workspace hierarchy.

4. **Output Generation**: The completed tree is saved as both JSON (for programmatic use) and a human-readable text file.

## Key Features

- **Rate Limiting Protection**: Implements smart exponential backoff and respects Notion API rate limits
- **Parallel Processing**: Processes multiple pages concurrently for improved performance
- **Loop Detection**: Identifies and handles circular references in the workspace structure
- **Error Resilience**: Gracefully handles permission errors, missing pages, and API failures
- **Configurable Execution**: Customizable parameters via environment variables
- **Comprehensive Output**: Produces both machine and human-readable representations of the workspace structure

## Usage

```bash
npm run notion-tree-mapper <connector_id>
```

Where `<connector_id>` is the ID of your Notion connector (which provides the OAuth token needed to access the Notion API).

## Configuration Options

You can customize the script's behavior through environment variables:

| Environment Variable    | Description                                | Default    |
|-------------------------|--------------------------------------------|------------|
| MAX_EXECUTION_TIME      | Maximum runtime in milliseconds            | 3600000 (1h) |
| MAX_SEARCH_PAGES        | Maximum pages to discover via search       | 10000      |
| BATCH_SIZE              | Number of pages to process in parallel     | 5          |
| MAX_PAGES_PER_BLOCK     | Maximum pagination requests per block      | 10         |
| MAX_PAGE_RETRIES        | Maximum retry attempts for failed pages    | 3          |

## Output

The script produces two output files:

1. **JSON File** (`notion-tree-{connector_id}-{timestamp}-{hash}.json`):
   - Contains complete workspace structure with metadata
   - Machine-readable format ideal for further processing
   - Includes page IDs, titles, types, and parent-child relationships

2. **Text File** (`notion-tree-{connector_id}-{timestamp}-{hash}.txt`):
   - Human-readable indented tree view of the workspace structure
   - Shows page titles, types, and IDs
   - Indentation represents the hierarchy depth

## Example Output

JSON structure:
```json
{
  "metadata": {
    "connectorId": "abc123",
    "timestamp": "2023-05-01T12:34:56.789Z",
    "nodeCount": 523,
    "rootCount": 15
  },
  "tree": {
    "nodes": [
      {
        "id": "page-id-123",
        "type": "page",
        "title": "Project Overview",
        "parentId": null,
        "children": ["child-page-id-456", "child-page-id-789"],
        "url": "https://notion.so/...",
        "lastEdited": "2023-04-30T15:23:45.678Z",
        "createdTime": "2023-01-15T09:12:34.567Z"
      },
      // More nodes...
    ],
    "rootNodes": ["page-id-123", "page-id-234", "page-id-345"]
  }
}
```

Text structure:
```
Notion Workspace Structure
=======================

- Project Overview (page, page-id-123)
  - Meeting Notes (page, child-page-id-456)
    - April Meetings (database, grand-child-id-111)
  - Resources (page, child-page-id-789)
- Knowledge Base (page, page-id-234)
  - Onboarding (page, child-page-id-567)
```

## Technical Details

The script uses several strategies to ensure reliability and performance:

- **Exponential Backoff**: Implements backoff with jitter for API retries
- **Pagination Handling**: Properly handles API pagination for large workspaces
- **Type Safety**: Strong TypeScript typing throughout the codebase
- **Memory Efficiency**: Uses Sets and Maps for efficient data storage
- **Queue Management**: Smart processing queue with priority handling

## Limitations

- **Access Restrictions**: Can only map content the OAuth token has access to
- **API Rate Limits**: May take time for very large workspaces due to Notion's API limits
- **Maximum Execution Time**: Default 1-hour timeout can be adjusted for larger workspaces

## Use Cases

- **Content Migration**: Map your Notion structure before migrating to another platform
- **Workspace Auditing**: Identify orphaned pages or circular references
- **Documentation**: Generate workspace documentation for team onboarding
- **Analytics**: Analyze workspace structure for optimization opportunities