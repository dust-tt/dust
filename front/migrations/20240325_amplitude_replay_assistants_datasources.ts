import type { AgentStatus } from "@dust-tt/types";
import { Op } from "sequelize";

import {
  trackAssistantCreated,
  trackDataSourceCreated,
} from "@app/lib/amplitude/back";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator } from "@app/lib/auth";
import {
  AgentConfiguration,
  DataSource,
  Membership,
  Workspace,
} from "@app/lib/models";

const workspaceIDS = ["3d77ca9ba9"];
const maxDate = "2024-03-23";

async function populateAssistantCreated(workspace: Workspace) {
  const assistants = await AgentConfiguration.findAll({
    where: {
      workspaceId: workspace.id,
      status: ["active", "archived"] satisfies AgentStatus[],
      createdAt: {
        [Op.lt]: new Date(maxDate),
      },
    },
  });
  for (const assistant of assistants) {
    const auth = await Authenticator.fromIds(assistant.authorId, workspace.sId);
    if (!auth.isUser()) {
      throw new Error("Only users can create agents.");
    }
    if (!auth.workspace()) {
      throw new Error("Workspace not found.");
    }
    const agentConfigType = await getAgentConfiguration(auth, assistant.sId);
    if (!agentConfigType) {
      throw new Error("Agent configuration not found." + assistant.sId);
    }
    await trackAssistantCreated(auth, { assistant: agentConfigType });
    console.log("tracked assistant created", assistant.sId, assistant.name);
  }
}

export async function populateDataSourceCreated(workspace: Workspace) {
  const dataSources = await DataSource.findAll({
    where: {
      workspaceId: workspace.id,
      createdAt: {
        [Op.lt]: new Date(maxDate),
      },
    },
  });
  const defaultAdmin = await Membership.findOne({
    where: {
      workspaceId: workspace.id,
      role: "admin",
    },
    order: [["createdAt", "ASC"]],
    limit: 1,
  });
  for (const dataSource of dataSources) {
    const adminId = dataSource.editedByUserId || defaultAdmin?.userId;
    if (!adminId) {
      throw new Error("Admin not found.");
    }
    const auth = await Authenticator.fromIds(adminId, workspace.sId);
    if (!auth.isUser()) {
      throw new Error("Only users can create agents.");
    }
    if (!auth.workspace()) {
      throw new Error("Workspace not found.");
    }
    const ds = await getDataSource(auth, dataSource.name);
    if (!ds) {
      throw new Error(
        `Data source not found: ${dataSource.name} in workspace ${workspace.sId}`
      );
    }
    await trackDataSourceCreated(auth, {
      dataSource: ds,
    });
  }
}

async function main() {
  for (const workspaceID of workspaceIDS) {
    const workspace = await Workspace.findOne({
      where: {
        sId: workspaceID,
      },
    });
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceID}`);
    }
    await populateAssistantCreated(workspace);
    await populateDataSourceCreated(workspace);
  }
}

main().catch(console.error);
