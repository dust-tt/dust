// tests/fixtures/knowledgeBases.ts

/**
 * Test knowledge base fixtures
 */
export const knowledgeBases = [
  {
    id: 'kb-1',
    name: 'Knowledge Base 1',
    description: 'Test knowledge base 1',
    workspaceId: 'workspace-1',
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
  },
  {
    id: 'kb-2',
    name: 'Knowledge Base 2',
    description: 'Test knowledge base 2',
    workspaceId: 'workspace-1',
    createdAt: '2023-01-02T00:00:00.000Z',
    updatedAt: '2023-01-02T00:00:00.000Z',
  },
  {
    id: 'kb-3',
    name: 'Knowledge Base 3',
    description: 'Test knowledge base 3',
    workspaceId: 'workspace-2',
    createdAt: '2023-01-03T00:00:00.000Z',
    updatedAt: '2023-01-03T00:00:00.000Z',
  },
];

/**
 * Test document fixtures
 */
export const documents = [
  {
    id: 'doc-1',
    title: 'Document 1',
    content: 'This is document 1 content',
    knowledgeBaseId: 'kb-1',
    workspaceId: 'workspace-1',
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
  },
  {
    id: 'doc-2',
    title: 'Document 2',
    content: 'This is document 2 content',
    knowledgeBaseId: 'kb-1',
    workspaceId: 'workspace-1',
    createdAt: '2023-01-02T00:00:00.000Z',
    updatedAt: '2023-01-02T00:00:00.000Z',
  },
  {
    id: 'doc-3',
    title: 'Document 3',
    content: 'This is document 3 content',
    knowledgeBaseId: 'kb-2',
    workspaceId: 'workspace-1',
    createdAt: '2023-01-03T00:00:00.000Z',
    updatedAt: '2023-01-03T00:00:00.000Z',
  },
];

/**
 * Test search result fixtures
 */
export const searchResults = [
  {
    id: 'search-1',
    knowledgeBaseId: 'kb-1',
    workspaceId: 'workspace-1',
    query: 'test query 1',
    results: [
      {
        id: 'doc-1',
        title: 'Document 1',
        content: 'This is document 1 content',
        score: 0.95,
      },
      {
        id: 'doc-2',
        title: 'Document 2',
        content: 'This is document 2 content',
        score: 0.85,
      },
    ],
    createdAt: '2023-01-01T00:00:00.000Z',
  },
  {
    id: 'search-2',
    knowledgeBaseId: 'kb-2',
    workspaceId: 'workspace-1',
    query: 'test query 2',
    results: [
      {
        id: 'doc-3',
        title: 'Document 3',
        content: 'This is document 3 content',
        score: 0.90,
      },
    ],
    createdAt: '2023-01-02T00:00:00.000Z',
  },
];
