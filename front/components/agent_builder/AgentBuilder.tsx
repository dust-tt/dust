import React from "react";

import { AgentBuilderLayout } from "@app/components/agent_builder/AgentBuilderLayout";
import { AgentBuilderLeftPanel } from "@app/components/agent_builder/AgentBuilderLeftPanel";
import { AgentBuilderRightPanel } from "@app/components/agent_builder/AgentBuilderRightPanel";
import { AgentBuilderInstructionsProvider } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsContext";

export default function AgentBuilder() {
  return (
    <AgentBuilderInstructionsProvider>
      <AgentBuilderLayout
        leftPanel={
          <AgentBuilderLeftPanel
            title="Create new agent"
            onCancel={() => console.log("Cancel")}
            onSave={() => console.log("Save")}
          />
        }
        rightPanel={<AgentBuilderRightPanel />}
      />
    </AgentBuilderInstructionsProvider>
  );
}
