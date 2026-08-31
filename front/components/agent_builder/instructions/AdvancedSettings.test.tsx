import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { LightWorkspaceType } from "@app/types/user";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdvancedSettings } from "./AdvancedSettings";

const owner: LightWorkspaceType = {
  id: 1,
  sId: "w_1",
  name: "Workspace",
  role: "admin",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

const { modelPickerPropsMock, generationSettingsOnChangeMock } = vi.hoisted(
  () => ({
    modelPickerPropsMock: vi.fn(),
    generationSettingsOnChangeMock: vi.fn(),
  })
);

let generationSettings: AgentBuilderFormData["generationSettings"] = {
  modelSettings: {
    providerId: "openai",
    modelId: "gpt-4o",
  },
  temperature: 0.7,
  reasoningEffort: "none",
  responseFormat: undefined,
};

vi.mock("@app/components/agent_builder/AgentBuilderContext", () => ({
  useAgentBuilderContext: () => ({ owner }),
}));

vi.mock("@app/components/model_picker/ModelPicker", () => ({
  ModelPicker: (props: unknown) => {
    modelPickerPropsMock(props);
    return null;
  },
}));

vi.mock("@app/components/sparkle/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

vi.mock("@app/components/SuspensedCodeEditor", () => ({
  SuspensedCodeEditor: () => null,
}));

vi.mock("react-hook-form", () => ({
  useController: ({ name }: { name: string }) => ({
    field:
      name === "generationSettings"
        ? {
            value: generationSettings,
            onChange: generationSettingsOnChangeMock,
          }
        : { value: undefined, onChange: vi.fn() },
  }),
}));

describe("AdvancedSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generationSettings = {
      modelSettings: {
        providerId: "openai",
        modelId: "gpt-4o",
      },
      temperature: 0.7,
      reasoningEffort: "none",
      responseFormat: undefined,
    };
  });

  it("uses the configured model as the picker agent model", () => {
    render(<AdvancedSettings />);

    expect(modelPickerPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        agentModel: {
          providerId: "openai",
          modelId: "gpt-4o",
          temperature: 0.7,
          reasoningEffort: "none",
        },
        lastRequestedModel: null,
      })
    );
  });
});
