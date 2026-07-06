import {
  SKILL_COMPANY_DATA_SERVER_NAME,
  type SystemSkillDefinition,
} from "@app/lib/resources/skill/code_defined/shared";

const DISCOVER_KNOWLEDGE_INSTRUCTIONS =
  "Default behavior: start by running semantic searches using the " +
  "`semantic_search` tool; this optimizes for " +
  "speed as semantic search can quickly find content throughout an entire " +
  "knowledge base.\n" +
  "Provide `nodeIds` only when you already know the relevant folder(s), " +
  "document(s), or page(s) to target; otherwise, search across all available " +
  "content and refine your query before exploring the data source hierarchy.\n" +
  "\n" +
  "Company data filesystem concepts:\n" +
  "- Connected company data is represented as a tree of nodes. A node can be " +
  "a data source root, folder, section, document or page.\n" +
  "- Tool outputs expose exact `nodeId` values. Use those IDs as `nodeId`, " +
  "`rootNodeId`, or `nodeIds` inputs; do not use human-readable titles as " +
  "IDs.\n" +
  "- A result with `hasChildren: true` can be expanded with " +
  "`list`, searched under with `find`, or used as a scope for " +
  "`semantic_search`.\n" +
  "\n" +
  "Company data filesystem tools:\n" +
  "- `semantic_search`: searches document and " +
  "page content by meaning. Typically use it first to answer a question or " +
  "find relevant passages; pass `nodeIds` only to restrict search to known " +
  "folders, documents, pages, and their children.\n" +
  "- `list`: lists direct children of a data " +
  "source root or folder. Typically use it when you need structure, sibling " +
  "documents, or exhaustive browsing; pass `nodeId: null` for data source " +
  "roots, then pass a returned `nodeId` to move down one level.\n" +
  "- `find`: searches node titles recursively " +
  "from `rootNodeId`. Typically use it when you know all or part of a " +
  "folder, document, or page title; omit `rootNodeId` to search all " +
  "configured data source trees.\n" +
  "- `locate_in_tree`: shows the full path from " +
  "a node to its data source root. Typically use it to understand where a " +
  "search result sits, identify parent folders, or cite a location.\n" +
  "- `cat`: reads one document or page by " +
  "`nodeId`. Typically use it for exact quotes, source checks, or verifying " +
  "facts; always provide a `limit` (max 10,000 characters), use `grep` for " +
  "relevant lines, and use `offset` only for focused chunks.\n" +
  "\n" +
  "Data warehouses (tables and schemas):\n" +
  "- Content is organized hierarchically: warehouse -> database -> schema " +
  "-> tables. Schemas can be arbitrarily nested.\n" +
  "- `list`: lists direct contents of a " +
  "warehouse, database, or schema. Typically use it to browse the warehouse " +
  "hierarchy; if no `nodeId` is provided, it lists all available warehouses.\n" +
  "- `find`: searches tables, schemas, and " +
  "databases by name. Typically use it when you know all or part of a table, " +
  "schema, or database name (e.g., 'sales' finds 'sales_2024', " +
  "'monthly_sales_report').\n" +
  "- `describe_tables`: returns table " +
  "schemas, DBML definitions, SQL dialect guidelines, and example rows. " +
  "Typically use it before writing SQL; all described tables must be from " +
  "the same warehouse.\n" +
  "- `query`: executes SQL queries. Typically use it after " +
  "`describe_tables`; " +
  "the query must respect the provided SQL dialect and all tables in the " +
  "query must be from the same warehouse.\n" +
  "\n" +
  "In order to properly use the data warehouses, it is useful to also search " +
  "through company data with `semantic_search` " +
  "in case there is some documentation available about the tables, some " +
  "additional semantic layer, or some code that may define how the tables " +
  "are built in the first place.\n" +
  "Tables are identified by ids in the format 'table-<dataSourceId>-<nodeId>'.\n" +
  "Warehouses are identified as 'warehouse-<dataSourceId>'.\n" +
  'A dataSourceId typically starts with the prefix "dts_".\n';

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
