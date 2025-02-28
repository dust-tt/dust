export const PageTemplates = {
  default: {
    includeTableOfContents: false,
    includeTable: false,
    paragraphCount: { min: 2, max: 5 },
    listCount: { min: 0, max: 2 },
    headingCount: { min: 1, max: 3 },
  },

  documentation: {
    includeTableOfContents: true,
    includeTable: false,
    paragraphCount: { min: 3, max: 8 },
    listCount: { min: 1, max: 3 },
    headingCount: { min: 3, max: 6 },
  },

  meetingNotes: {
    includeTableOfContents: false,
    includeTable: false,
    paragraphCount: { min: 2, max: 4 },
    listCount: { min: 1, max: 2 },
    headingCount: { min: 1, max: 3 },
    includeTodos: true,
  },

  projectDashboard: {
    includeTableOfContents: true,
    includeTable: true,
    paragraphCount: { min: 1, max: 3 },
    listCount: { min: 1, max: 2 },
    headingCount: { min: 2, max: 4 },
    includeCallouts: true,
    includeLinkedDatabases: true,
  },

  wiki: {
    includeTableOfContents: true,
    includeTable: true,
    paragraphCount: { min: 4, max: 10 },
    listCount: { min: 2, max: 5 },
    headingCount: { min: 3, max: 8 },
    includeCallouts: true,
    includeToggleLists: true,
  },
};
