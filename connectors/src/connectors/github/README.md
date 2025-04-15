# GitHub Connector

## Overview

This connector integrates with GitHub to sync repositories, issues, discussions, and code.

## Pagination

### REST API

For small data sets, the connector uses page-based pagination with the `page` parameter.

### GraphQL API

For large data sets (like issues on large repositories), the connector uses GraphQL with cursor-based pagination. This is required by GitHub, which returns an error for page-based pagination on large datasets:

```
HttpError: Pagination with the page parameter is not supported for large datasets, please use cursor based pagination (after/before)
```

GraphQL queries are defined in `lib/graphql/queries/*.graphql` and their types are generated using GraphQL Code Generator. See `lib/graphql/README.md` for more details.

## Components

- `lib/`: Core API integration libraries
  - `github_api.ts`: API client functions for GitHub
  - `errors.ts`: Error handling utilities
  - `utils.ts`: Utility functions
  - `github_graphql.ts`: GraphQL schema types
  - `graphql/`: GraphQL queries and generated types
- `temporal/`: Temporal workflow definitions
  - `activities.ts`: Activity functions
  - `workflows.ts`: Workflow definitions
  - `signals.ts`: Signal definitions
  - `utils.ts`: Workflow utility functions

## Workflows

The connector implements several workflows:
- Full repository sync
- Incremental issue sync
- Code sync
- Discussions sync

## Authentication

Authentication is handled through OAuth connections.