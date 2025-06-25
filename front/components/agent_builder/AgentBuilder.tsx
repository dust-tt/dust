import React from "react";

import { AgentBuilderLayout } from "@app/components/agent_builder/AgentBuilderLayout";
import { AgentBuilderLeftPanel } from "@app/components/agent_builder/AgentBuilderLeftPanel";
import { AgentBuilderRightPanel } from "@app/components/agent_builder/AgentBuilderRightPanel";
import { AgentBuilderCapabilitiesProvider } from "@app/components/agent_builder/capabilities/AgentBuilderCapabilitiesContext";
import { AgentBuilderInstructionsProvider } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsContext";
import { AgentBuilderSettingsProvider } from "@app/components/agent_builder/settings/AgentSettingsContext";

export default function AgentBuilder() {
  return (
    <AgentBuilderInstructionsProvider>
      <AgentBuilderCapabilitiesProvider>
        <AgentBuilderSettingsProvider>
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
        </AgentBuilderSettingsProvider>
      </AgentBuilderCapabilitiesProvider>
    </AgentBuilderInstructionsProvider>
  );
}
