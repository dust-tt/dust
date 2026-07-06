import {
  SKILL_COMPANY_DATA_SERVER_NAME,
  type SystemSkillDefinition,
} from "@app/lib/resources/skill/code_defined/shared";

const DISCOVER_KNOWLEDGE_INSTRUCTIONS =
  [
    "Default behavior: start with `semantic_search`. It is best for quick, broad",
    "discovery across connected knowledge.",
    "Browse the tree only when you need structure, neighboring documents, or a",
    "complete pass through a known area.",
    "",
    "Company data filesystem concepts:",
    "- Company data is a tree of nodes: roots, folders, sections, documents, and",
    "  pages.",
    "- Tool outputs include stable node IDs. Prefer those IDs over titles when",
    "  moving from discovery to reading or narrowing scope.",
    "",
    "Company data filesystem tools:",
    "- `semantic_search`: best for finding content by topic, intent, or meaning,",
    "  even when the exact title is unknown.",
    "- `list`: best for understanding folder structure, sibling documents, and",
    "  exhaustive browsing under a known area.",
    "- `find`: best for title-based discovery when you remember a folder,",
    "  document, page, or section name.",
    "- `locate_in_tree`: best for orientation: where a result lives, what its",
    "  parents are, and how to cite its location.",
    "- `cat`: best for reading a known document or page when you need exact",
    "  wording, source checks, or factual verification.",
    "",
    "Data warehouses (tables and schemas):",
    "- Warehouse content is organized as warehouse -> database -> schema ->",
    "  tables. Schemas can be nested.",
    "- `list`: best for browsing the warehouse hierarchy and understanding what",
    "  databases, schemas, and tables are available.",
    "- `find`: best for name-based discovery of tables, schemas, and databases.",
    "- `describe_tables`: best for understanding table columns, types, examples,",
    "  and SQL dialect guidance before writing SQL.",
    "- `query`: best for answering data questions once the relevant tables are",
    "  known and described.",
    "",
    "Warehouse questions often need business context. Search company data with",
    "`semantic_search` for table documentation, semantic layers, metric",
    "definitions, or code that explains how tables are built.",
  ].join("\n") + "\n";

export const discoverKnowledgeSkill = {
  sId: "discover_knowledge",
  name: "Discover Knowledge",
  userFacingDescription:
    "Search across all your company documents and data warehouses to surface " +
    "the information you need without manual configuration.",
  agentFacingDescription:
    "Search documents, browse folder hierarchies, read file contents, and " +
    "query data warehouse tables with SQL.",
  instructions: DISCOVER_KNOWLEDGE_INSTRUCTIONS,
  mcpServers: [
    {
      name: "data_sources_file_system",
      serverNameOverride: SKILL_COMPANY_DATA_SERVER_NAME,
    },
    { name: "data_warehouses" },
  ],
  version: 1,
  icon: "ActionBookOpenIcon",
  inheritAgentConfigurationDataSources: true,
} as const satisfies SystemSkillDefinition;
