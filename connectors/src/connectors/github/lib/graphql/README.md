# GitHub GraphQL Types

This directory contains GraphQL type definitions for GitHub's API, generated using GraphQL Code Generator.

## Directory Structure

- `queries/`: Contains GraphQL query definitions
  - `issues.graphql`: Query for retrieving GitHub issues with cursor-based pagination
- `generated.ts`: Auto-generated TypeScript types for the GraphQL queries

## Type Generation

The types are generated using GraphQL Code Generator. The configuration is in the root `codegen.ts` file.

To regenerate the types (after modifying the queries or schema):

```bash
npx graphql-codegen
```

## Usage

Import the generated types in your code:

```typescript
import { GetIssuesQuery } from "./graphql/generated";
```

Then use them with Octokit's GraphQL client:

```typescript
const result = await octokit.graphql<GetIssuesQuery>(`
  query GetIssues($owner: String!, $repo: String!, $cursor: String, $perPage: Int!) {
    // Query definition here
  }
`, {
  owner,
  repo,
  cursor,
  perPage
});
```

## Note on Pagination

This implementation uses cursor-based pagination (with `after` parameter) instead of page-based pagination (with `page` parameter), as GitHub requires cursor-based pagination for large datasets.