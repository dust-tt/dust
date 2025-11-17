update agent_messages set "agentConfigurationId"='deep-dive' where "agentConfigurationId"='dust-deep';
update mentions set "agentConfigurationId"='deep-dive' where "agentConfigurationId"='dust-deep';
-- Note: this was not enough to migrate, we also needed to migrate the agent_child_agent_configurations table see next migration.
