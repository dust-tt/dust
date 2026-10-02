import type { AgentBuilderFormData } from "@app/components/agent_builder/agentBuilderFormSchema";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { AccessSection } from "./AccessSection";

vi.mock("@app/components/agent_builder/AgentBuilderContext", () => ({
  useAgentBuilderContext: () => ({ owner: { sId: "w_1" } }),
}));

vi.mock("@app/components/agent_builder/DataSourceViewsContext", () => ({
  useDataSourceViewsContext: () => ({ supportedDataSourceViews: [] }),
}));

vi.mock("@app/components/agent_builder/hooks/useAgentRequestedSpaces", () => ({
  useAgentRequestedSpaces: () => ({ nonGlobalSpacesWithRestrictions: [] }),
}));

vi.mock("@app/lib/swr/permissions", () => ({
  useWorkspacePermissions: () => ({ hasPermission: () => true }),
}));

vi.mock(
  "@app/components/agent_builder/settings/AgentBuilderAvailabilityMessage",
  () => ({ AgentBuilderAvailabilityMessage: () => null })
);

vi.mock(
  "@app/components/assistant/conversation/space/ManageUsersPanel",
  () => ({
    ManageUsersPanel: () => null,
  })
);

interface FormWrapperProps {
  children: ReactNode;
}

function FormWrapper({ children }: FormWrapperProps) {
  const form = useForm<AgentBuilderFormData>({
    defaultValues: {
      agentSettings: { scope: "hidden", slackProvider: null, editors: [] },
    } as unknown as AgentBuilderFormData,
  });
  return <FormProvider {...form}>{children}</FormProvider>;
}

function renderAccessSection(isEditorsListUnavailable: boolean) {
  render(
    <FormWrapper>
      <AccessSection
        isEditorGateVisible={false}
        isAddingSelfAsEditor={false}
        isEditorsListUnavailable={isEditorsListUnavailable}
        onAddSelfAsEditor={() => {}}
      />
    </FormWrapper>
  );
}

describe("AccessSection", () => {
  it("disables adding editors until the editors list is available", () => {
    renderAccessSection(true);

    expect(screen.getByRole("button", { name: "Add editors" })).toBeDisabled();
  });

  it("enables adding editors once the editors list is available", () => {
    renderAccessSection(false);

    expect(screen.getByRole("button", { name: "Add editors" })).toBeEnabled();
  });
});
