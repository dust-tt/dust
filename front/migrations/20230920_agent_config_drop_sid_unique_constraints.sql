alter table
    "agent_configurations" drop constraint "agent_configurations_sId_key";

alter table
    "agent_configurations" drop constraint "agent_configurations_sId_key1";

alter table
    "agent_configurations" drop constraint "agent_configurations_sId_key2";

alter table
    "agent_configurations" drop constraint "agent_configurations_sId_key3";

alter table
    "agent_configurations" drop constraint "agent_configurations_sId_key4";

alter table
    "agent_configurations" drop constraint "agent_configurations_sId_key5";

alter table
    "agent_configurations" drop constraint "agent_configurations_workspace_id_name";

DROP index "agent_configurations_s_id";

drop index "agent_configurations_workspace_id_name";