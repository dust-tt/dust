-- Migration created on Dec 10, 2025

ALTER TABLE "skill_mcp_server_configurations"
    DROP CONSTRAINT "skill_mcp_server_configurations_skillConfigurationId_fkey",
    ADD CONSTRAINT "skill_mcp_server_configurations_skillConfigurationId_fkey"
        FOREIGN KEY ("skillConfigurationId")
        REFERENCES "skill_configurations" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
