import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

const DISCOVER_KNOWLEDGE_INSTRUCTIONS =
  "Default behavior: optimize for speed by starting with `semantic_search`.\n" +
  "Provide `nodeIds` only when you already know the relevant folder(s) or document(s) to target;\n" +
  "otherwise, search across all available content and refine your query before exploring the tree.\n\n" +
  "Data sources (documents and folders):\n" +
  "Use tree-navigation tools when thoroughness is required:\n" +
  "- Use `list` to enumerate direct children of a node (folders and documents). If no node is provided, list from data source roots.\n" +
  "- Use `find` to locate nodes by title recursively from a given node (partial titles are OK). Helpful to narrow scope when search is too broad.\n" +
  "- Use `locate_in_tree` to display the full path from a node up to its data source root when you need to understand or show where it sits.\n\n" +
  "Search and reading:\n" +
  "- Use `semantic_search` to retrieve relevant content quickly. Pass `nodeIds` to limit scope only when needed; otherwise search globally.\n" +
  "- Use `cat` sparingly to extract short, relevant snippets you need to quote or verify facts. Prefer searching over reading large files end-to-end. ALWAYS provide a `limit` when using `cat`. The maximum `limit` is 10,000 characters. For long documents, read in chunks using `offset` and `limit`. Optionally use `grep` to narrow to relevant lines.\n\n" +
  "Data warehouses (tables and schemas):\n" +
  "- Content is organized hierarchically: warehouse → database → schema → tables. Schemas can be arbitrarily nested.\n" +
  "- Use `list` to enumerate direct contents of a warehouse, database, or schema. If no nodeId is provided, lists all available warehouses.\n" +
  "- Use `find` to search for tables, schemas, and databases by name. Supports partial matching (e.g., 'sales' finds 'sales_2024', 'monthly_sales_report').\n" +
  "- Use `describe_tables` to get detailed schema information (DBML definitions, SQL dialect guidelines, example rows) before writing queries. All tables must be from the same warehouse.\n" +
  "- Use `query` to execute SQL queries. You MUST call `describe_tables` first. The query must respect the SQL dialect and guidelines provided. All tables in a query must be from the same warehouse.\n" +
  "- Tables are identified as 'table-<dataSourceId>-<nodeId>'. Warehouses are identified as 'warehouse-<dataSourceId>'. A dataSourceId typically starts with \"dts_\".\n" +
  "- Search through company data for documentation about tables, semantic layers, or code that defines how tables are built.";

export const discoverKnowledgeSkill = {
  sId: "discover_knowledge",
  name: "Discover Knowledge",
  userFacingDescription:
    "Search and explore company knowledge across documents and data warehouses.",
  agentFacingDescription:
    "Search documents, browse folder hierarchies, read file contents, and query data warehouse tables with SQL.",
  instructions: DISCOVER_KNOWLEDGE_INSTRUCTIONS,
  internalMCPServerNames: ["data_sources_file_system", "data_warehouses"],
  version: 1,
  icon: "ActionBookOpenIcon",
  inheritAgentConfigurationDataSources: true,
  isAutoEnabled: true,
} as const satisfies GlobalSkillDefinition;
