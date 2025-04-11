import type { CodegenConfig } from "@graphql-codegen/cli";

// For GitHub's GraphQL API, we'll use a simplified schema that only includes what we need
const schema = `
scalar URI
scalar HTML
scalar DateTime

type PageInfo {
  endCursor: String
  hasNextPage: Boolean!
}

type Actor {
  login: String!
}

type Label {
  name: String!
}

type LabelConnection {
  nodes: [Label]
}

type Issue {
  id: ID!
  number: Int!
  title: String!
  url: URI!
  author: Actor
  createdAt: DateTime!
  updatedAt: DateTime!
  body: String
  state: String!
  # __typename is a special field that's automatically included in GraphQL responses
  # We don't need to declare it in our schema
  labels(first: Int): LabelConnection
}

type IssueConnection {
  pageInfo: PageInfo!
  nodes: [Issue]
}

enum IssueState {
  OPEN
  CLOSED
}

type Repository {
  issues(first: Int, after: String, states: [IssueState!]): IssueConnection!
}

type Query {
  repository(owner: String!, name: String!): Repository
}

schema {
  query: Query
}
`;

const config: CodegenConfig = {
  overwrite: true,
  schema: schema,
  documents: ["src/connectors/github/lib/graphql/queries/*.graphql"],
  generates: {
    "src/connectors/github/lib/graphql/generated.ts": {
      plugins: ["typescript", "typescript-operations"],
    },
  },
};

export default config;