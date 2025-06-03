import React from "react";

import { AgentBuilderLayout } from "@app/components/agent_builder/AgentBuilderLayout";
import { AgentBuilderLeftPanel } from "@app/components/agent_builder/AgentBuilderLeftPanel";
import { AgentBuilderRightPanel } from "@app/components/agent_builder/AgentBuilderRightPanel";
import type { WorkspaceType } from "@app/types";

interface AgentBuilderProps {
  owner: WorkspaceType;
}

export default function AgentBuilder({ owner }: AgentBuilderProps) {
  return (
    <AgentBuilderLayout
      owner={owner}
      leftPanel={
        <AgentBuilderLeftPanel
          title="Create new agent"
          onCancel={() => console.log("Cancel")}
          onSave={() => console.log("Save")}
        />
      }
      rightPanel={<AgentBuilderRightPanel />}
    />
  );
}
