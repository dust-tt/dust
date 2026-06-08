// Marketing stub: the real MCP server registry lives in front and pulls in
// the entire MCP server graph (Sequelize Resources, Temporal, etc.). For the
// public integrations page we only need the surface metadata. Until a build-
// time snapshot pipeline is wired up to bake that metadata into marketing,
// this is intentionally empty — the integrations grid will render with the
// connector-provided entries only.
export const INTERNAL_MCP_SERVERS: Record<string, never> = {};
