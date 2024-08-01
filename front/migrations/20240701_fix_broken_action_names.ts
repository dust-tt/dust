import type { AgentAction } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import _ from "lodash";
import { QueryTypes } from "sequelize";

import { AgentBrowseConfiguration } from "@app/lib/models/assistant/actions/browse";
import { AgentProcessConfiguration } from "@app/lib/models/assistant/actions/process";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import { AgentTablesQueryConfiguration } from "@app/lib/models/assistant/actions/tables_query";
import { AgentWebsearchConfiguration } from "@app/lib/models/assistant/actions/websearch";
import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }) => {
  type ActionConfig = {
    id: number;
    name: string;
    agentConfigurationId: number;
    action: AgentAction;
  };

  const rename = (
    actions: ActionConfig[]
  ): Array<ActionConfig & { renamed: boolean; originalName?: string }> => {
    // sort by id first
    let cleanedActions: Array<ActionConfig & { originalName?: string }> =
      actions.toSorted((a, b) => a.id - b.id);
    // remove _number from the end of the name
    cleanedActions = cleanedActions.map((action) => {
      return {
        ...action,
        name: action.name.replace(/_[0-9]+$/, ""),
        originalName: action.name,
      };
    });
    const indexByActionName: Record<string, number | undefined> = {};
    const newActions = [];
    for (const action of cleanedActions) {
      const index = indexByActionName[action.name] || 1;
      indexByActionName[action.name] = index + 1;
      const suffix = index > 1 ? `_${index}` : "";
      const newName = `${action.name}${suffix}`;
      newActions.push({
        ...action,
        name: newName,
        renamed: newName !== action.originalName,
      });
    }
    return newActions;
  };

  const toRename: Array<
    ActionConfig & { renamed: boolean; originalName?: string }
  > = [];

  const agentRetrievalConfigs = await frontSequelize.query<ActionConfig>(
    `SELECT 
        arc.id, arc.name, arc."agentConfigurationId", 'retrieval_configuration' as action 
    FROM 
        agent_retrieval_configurations arc
    INNER JOIN agent_configurations ac ON arc."agentConfigurationId" = ac.id
    WHERE arc.name is NOT NULL and arc.name != '' AND ac.status = 'active'
    `,
    {
      type: QueryTypes.SELECT,
    }
  );

  const retrievalConfigsByAgentConfigId = _.groupBy(
    agentRetrievalConfigs,
    "agentConfigurationId"
  );
  for (const [, agentRetrievalConfigs] of Object.entries(
    retrievalConfigsByAgentConfigId
  )) {
    const renamedActions = rename(agentRetrievalConfigs).filter(
      (a) => a.renamed
    );
    for (const a of renamedActions) {
      toRename.push(a);
    }
  }

  const agentTablesQueryConfigs = await frontSequelize.query<ActionConfig>(
    `SELECT 
        arc.id, arc.name, "agentConfigurationId", 'tables_query_configuration' as action 
    FROM 
        agent_tables_query_configurations arc
    INNER JOIN agent_configurations ac ON arc."agentConfigurationId" = ac.id
    WHERE arc.name is NOT NULL and arc.name != '' AND ac.status = 'active'
    `,
    {
      type: QueryTypes.SELECT,
    }
  );
  const tablesQueryConfigsByAgentConfigId = _.groupBy(
    agentTablesQueryConfigs,
    "agentConfigurationId"
  );
  for (const [, agentTablesQueryConfigs] of Object.entries(
    tablesQueryConfigsByAgentConfigId
  )) {
    const renamedActions = rename(agentTablesQueryConfigs).filter(
      (a) => a.renamed
    );
    for (const a of renamedActions) {
      toRename.push(a);
    }
  }

  const browseConfigs = await frontSequelize.query<ActionConfig>(
    `SELECT 
        arc.id, arc.name, "agentConfigurationId", 'browse_configuration' as action 
    FROM 
        agent_browse_configurations arc
    INNER JOIN agent_configurations ac ON arc."agentConfigurationId" = ac.id
    WHERE arc.name is NOT NULL and arc.name != '' AND ac.status = 'active'`,
    {
      type: QueryTypes.SELECT,
    }
  );
  const browseConfigsByAgentConfigId = _.groupBy(
    browseConfigs,
    "agentConfigurationId"
  );
  for (const [, browseConfigs] of Object.entries(
    browseConfigsByAgentConfigId
  )) {
    const renamedActions = rename(browseConfigs).filter((a) => a.renamed);
    for (const a of renamedActions) {
      toRename.push(a);
    }
  }

  const websearchConfigs = await frontSequelize.query<ActionConfig>(
    `SELECT 
        arc.id, arc.name, "agentConfigurationId", 'websearch_configuration' as action 
    FROM 
        agent_websearch_configurations arc
    INNER JOIN agent_configurations ac ON arc."agentConfigurationId" = ac.id
    WHERE arc.name is NOT NULL and arc.name != '' AND ac.status = 'active'`,
    {
      type: QueryTypes.SELECT,
    }
  );
  const websearchConfigsByAgentConfigId = _.groupBy(
    websearchConfigs,
    "agentConfigurationId"
  );
  for (const [, websearchConfigs] of Object.entries(
    websearchConfigsByAgentConfigId
  )) {
    const renamedActions = rename(websearchConfigs).filter((a) => a.renamed);
    for (const a of renamedActions) {
      toRename.push(a);
    }
  }

  const processConfigs = await frontSequelize.query<ActionConfig>(
    `SELECT 
        arc.id, arc.name, "agentConfigurationId", 'process_configuration' as action 
    FROM 
        agent_process_configurations arc
    INNER JOIN agent_configurations ac ON arc."agentConfigurationId" = ac.id
    WHERE arc.name is NOT NULL and arc.name != '' AND ac.status = 'active'`,
    {
      type: QueryTypes.SELECT,
    }
  );
  const processConfigsByAgentConfigId = _.groupBy(
    processConfigs,
    "agentConfigurationId"
  );
  for (const [, processConfigs] of Object.entries(
    processConfigsByAgentConfigId
  )) {
    const renamedActions = rename(processConfigs).filter((a) => a.renamed);
    for (const a of renamedActions) {
      toRename.push(a);
    }
  }

  for (const [i, a] of toRename.entries()) {
    console.log(
      `Renaming action (type=${a.action}) ${a.originalName} to ${a.name} for agent configuration ${a.agentConfigurationId} (${i + 1}/${toRename.length})`
    );
    if (execute) {
      const Model = (() => {
        switch (a.action) {
          case "retrieval_configuration":
            return AgentRetrievalConfiguration;
          case "tables_query_configuration":
            return AgentTablesQueryConfiguration;
          case "browse_configuration":
            return AgentBrowseConfiguration;
          case "process_configuration":
            return AgentProcessConfiguration;
          case "websearch_configuration":
            return AgentWebsearchConfiguration;
          case "dust_app_run_configuration":
            throw new Error("Unreachable");
          default:
            assertNever(a.action);
        }
      })();
      await (Model as any).update(
        { name: a.name },
        {
          where: {
            id: a.id,
          },
        }
      );
    }
  }
});
