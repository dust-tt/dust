import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type {
  DustAppRunConfigurationType,
  LightAgentConfigurationType,
  ModelConfigurationType,
} from "@app/types";

export type BaseSelectionSummary = {
  title: string;
  description?: string;
  onEdit: () => void;
};

export type DustAppSelectionSummary = BaseSelectionSummary & {
  id: "dust-app";
  visual: { type: "icon" };
  editLabel: "Edit selection";
};

export type ChildAgentSelectionSummary = BaseSelectionSummary & {
  id: "child-agent";
  visual: { type: "avatar"; name: string; pictureUrl?: string | null };
  editLabel: "Edit agent";
};

export type ReasoningModelSelectionSummary = BaseSelectionSummary & {
  id: "reasoning-model";
  visual: { type: "icon" };
  editLabel: "Edit model";
};

export type SingleSelectionSummary =
  | DustAppSelectionSummary
  | ChildAgentSelectionSummary
  | ReasoningModelSelectionSummary;

export function createDustAppSummary({
  dustAppConfiguration,
  onEdit,
}: {
  dustAppConfiguration: DustAppRunConfigurationType | null;
  onEdit: () => void;
}): DustAppSelectionSummary | null {
  if (!dustAppConfiguration) {
    return null;
  }
  return {
    id: "dust-app",
    visual: { type: "icon" },
    title: dustAppConfiguration.name,
    description: dustAppConfiguration.description ?? "No description available",
    editLabel: "Edit selection",
    onEdit,
  };
}

export function createChildAgentSummary({
  childAgentId,
  agents,
  onEdit,
}: {
  childAgentId: string | null;
  agents: LightAgentConfigurationType[];
  onEdit: () => void;
}): ChildAgentSelectionSummary | null {
  const selectedAgent = agents.find((a) => a.sId === childAgentId);
  if (!childAgentId || !selectedAgent) {
    return null;
  }

  return {
    id: "child-agent",
    visual: {
      type: "avatar",
      name: selectedAgent.name,
      pictureUrl: selectedAgent.pictureUrl,
    },
    title: selectedAgent.name,
    description: selectedAgent.description || "No description available",
    editLabel: "Edit agent",
    onEdit,
  };
}

export function createReasoningModelSummary({
  reasoningModel,
  models,
  onEdit,
}: {
  reasoningModel: { modelId: string; providerId: string } | null;
  models: ModelConfigurationType[];
  onEdit: () => void;
}): ReasoningModelSelectionSummary | null {
  const model = models.find(
    (m) =>
      m.modelId === reasoningModel?.modelId &&
      m.providerId === reasoningModel?.providerId
  );
  if (!model) {
    return null;
  }

  return {
    id: "reasoning-model",
    visual: { type: "icon" },
    title: model.displayName,
    description: model.description || "No description available",
    editLabel: "Edit model",
    onEdit,
  };
}

type BuildSelectionSummarySharedArgs = {
  onEdit: () => void;
};

type BuildSelectionSummaryArgs =
  | (BuildSelectionSummarySharedArgs & {
      kind: "dust-app";
      dustAppConfiguration: ServerSideMCPServerConfigurationType["dustAppConfiguration"];
    })
  | (BuildSelectionSummarySharedArgs & {
      kind: "child-agent";
      childAgentId: ServerSideMCPServerConfigurationType["childAgentId"];
      agents: LightAgentConfigurationType[];
    })
  | (BuildSelectionSummarySharedArgs & {
      kind: "reasoning-model";
      reasoningModel: ServerSideMCPServerConfigurationType["reasoningModel"];
      models: ModelConfigurationType[];
    });

export function buildSelectionSummary(
  args: BuildSelectionSummaryArgs
): SingleSelectionSummary | null {
  switch (args.kind) {
    case "dust-app":
      return createDustAppSummary({
        dustAppConfiguration: args.dustAppConfiguration,
        onEdit: args.onEdit,
      });
    case "child-agent":
      return createChildAgentSummary({
        childAgentId: args.childAgentId,
        agents: args.agents,
        onEdit: args.onEdit,
      });
    case "reasoning-model":
      return createReasoningModelSummary({
        reasoningModel: args.reasoningModel,
        models: args.models,
        onEdit: args.onEdit,
      });
  }
}
