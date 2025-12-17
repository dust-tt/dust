// GraphQL query for fetching GitHub Issue or Pull Request by node ID
// Use inline fragment as node interface returns PullRequest or Issue type
export const GITHUB_NODE_QUERY = `
  query($nodeId: ID!) {
    node(id: $nodeId) {
      ... on Issue {
        __typename
        number
        title
        body
        state
        url
        repository {
          owner {
            login
          }
          name
        }
        author {
          login
        }
        comments(first: 100) {
          nodes {
            author {
              login
            }
            body
            createdAt
          }
        }
      }
      ... on PullRequest {
        __typename
        number
        title
        body
        state
        url
        repository {
          owner {
            login
          }
          name
        }
        author {
          login
        }
        comments(first: 100) {
          nodes {
            author {
              login
            }
            body
            createdAt
          }
        }
        reviews(first: 100) {
          nodes {
            author {
              login
            }
            body
            state
            createdAt
            comments(first: 100) {
              nodes {
                author {
                  login
                }
                body
                createdAt
              }
            }
          }
        }
      }
    }
  }
`;
