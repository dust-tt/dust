import type { QueryInterface } from "sequelize";

async function up(queryInterface: QueryInterface) {
  // First, drop the foreign key constraint from agent_data_source_configurations
  await queryInterface.sequelize.query(
    `ALTER TABLE agent_data_source_configurations DROP CONSTRAINT IF EXISTS agent_data_source_configurations_processConfigurationId_fkey;`
  );

  // Drop the processConfigurationId column from agent_data_source_configurations
  await queryInterface.removeColumn(
    "agent_data_source_configurations",
    "processConfigurationId"
  );

  // Drop the process action tables
  await queryInterface.dropTable("agent_process_actions");
  await queryInterface.dropTable("agent_process_configurations");
}

async function down(queryInterface: QueryInterface) {
  // This migration is not reversible - we're dropping tables and removing data
  throw new Error("This migration is not reversible");
}

module.exports = {
  up,
  down,
};
