-- Front DBs run with Cloud SQL flags autovacuum_analyze_threshold=10000 and
-- autovacuum_analyze_scale_factor=0, i.e. ANALYZE after every 10k changed rows regardless of
-- table size. On large tables this re-analyzes near-constantly for no statistics gain; scale
-- the factor by table size instead.
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE agent_mcp_action_output_items SET (autovacuum_analyze_scale_factor = 0.005);
ALTER TABLE files SET (autovacuum_analyze_scale_factor = 0.006);
ALTER TABLE agent_step_contents SET (autovacuum_analyze_scale_factor = 0.008);
ALTER TABLE runs SET (autovacuum_analyze_scale_factor = 0.011);
ALTER TABLE run_usages SET (autovacuum_analyze_scale_factor = 0.012);
ALTER TABLE agent_mcp_actions SET (autovacuum_analyze_scale_factor = 0.016);
ALTER TABLE agent_step_content_tool_executions SET (autovacuum_analyze_scale_factor = 0.016);
ALTER TABLE messages SET (autovacuum_analyze_scale_factor = 0.021);
ALTER TABLE user_messages SET (autovacuum_analyze_scale_factor = 0.045);
ALTER TABLE agent_messages SET (autovacuum_analyze_scale_factor = 0.045);
ALTER TABLE mentions SET (autovacuum_analyze_scale_factor = 0.045);
ALTER TABLE mcp_server_views SET (autovacuum_analyze_scale_factor = 0.057);
ALTER TABLE conversations SET (autovacuum_analyze_scale_factor = 0.095);
