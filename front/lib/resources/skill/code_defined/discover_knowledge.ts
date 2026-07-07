import {
  SKILL_COMPANY_DATA_SERVER_NAME,
  type SystemSkillDefinition,
} from "@app/lib/resources/skill/code_defined/shared";

const DISCOVER_KNOWLEDGE_INSTRUCTIONS =
  "Default behavior: start with `semantic_search` for most knowledge questions. " +
  "It is the fastest way to discover relevant material across connected " +
  "sources, especially when the useful content may not match the user's exact " +
  "wording. Switch to browsing when you need structure, neighboring documents, " +
  "or a complete pass through a known area.\n" +
  "\n" +
  "Company data filesystem concepts:\n" +
  "- Company data is a tree of nodes: roots, folders, sections, documents, and " +
  "pages.\n" +
  "- Tool outputs include stable node IDs. Prefer those IDs over titles when " +
  "moving from discovery to reading or narrowing scope.\n" +
  "\n" +
  "Company data filesystem tools:\n" +
  "- `semantic_search`: best for topic, intent, or meaning-based discovery. " +
  "Use it for broad questions, policies, project context, scattered facts, or " +
  "anything where the exact page title is unknown.\n" +
  "- `list`: best for understanding structure and coverage. Use it when a " +
  "folder or data source matters as a collection, when search feels too broad, " +
  "or when nearby sibling documents may be relevant.\n" +
  "- `find`: best for title-based discovery. Use it when the user remembers a " +
  "folder, document, page, or section name, or when a named area should be " +
  "located before reading or browsing around it.\n" +
  "- `locate_in_tree`: best for orientation and provenance. Use it after search " +
  "or find results to understand where an item lives, disambiguate similarly " +
  "named documents, or cite the source location.\n" +
  "- `cat`: best for reading a known document or page. Use it for exact " +
  "wording, source checks, factual verification, and details that search " +
  "snippets may omit.\n" +
  "\n" +
  "Data warehouses (tables and schemas):\n" +
  "- Warehouse content is organized as warehouse -> database -> schema -> " +
  "tables. Schemas can be nested.\n" +
  "- Warehouse and table IDs are synthetic identifiers, not display names. " +
  "Warehouse IDs look like `warehouse-<dataSourceId>`, table IDs look like " +
  "`table-<dataSourceId>-<nodeId>`, and dataSourceId values typically start " +
  "with `dts_`.\n" +
  "- `list`: best for mapping an unfamiliar warehouse. Use it to understand " +
  "which databases, schemas, and tables exist before choosing a direction.\n" +
  "- `find`: best for name-based discovery. Use it when the user mentions a " +
  "table, schema, database, or business noun that may appear in object names.\n" +
  "- `describe_tables`: best for deciding whether tables fit the question. It " +
  "gives columns, types, examples, and SQL dialect guidance before querying.\n" +
  "- `query`: best for computing answers from known tables: counts, " +
  "aggregates, joins, filters, rankings, trends, and other SQL-backed " +
  "analysis.\n" +
  "\n" +
  "Warehouse questions often need business context. Pair warehouse tools with " +
  "`semantic_search` when table documentation, semantic layers, metric " +
  "definitions, or upstream transformation code could explain the data.\n";

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
