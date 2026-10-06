import type {
  AgentBuilderFormData,
  AgentBuilderSkillsType,
} from "@app/components/agent_builder/agentBuilderFormSchema";
import { useAgentRequestedSpaces } from "@app/components/agent_builder/hooks/useAgentRequestedSpaces";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { SWRConfig } from "swr";
import { expect, it, vi } from "vitest";

const owner = LightWorkspaceFactory.build();

vi.mock("@app/components/shared/SpacesContext", () => ({
  useSpacesContext: () => ({ owner, spaces: [], isSpacesLoading: false }),
}));
vi.mock("@app/components/shared/tools_picker/MCPServerViewsContext", () => ({
  useMCPServerViewsContext: () => ({ mcpServerViews: [] }),
}));

const skill: AgentBuilderSkillsType = {
  sId: "selected",
  name: "Selected skill",
  description: "",
  icon: null,
  availability: "editors",
  canWrite: false,
  requestedSpaceIds: ["required-space"],
};

it("uses selected skills' space requirements without fetching skills", () => {
  const fetcher = vi.fn();
  const fetcherWithBody = vi.fn();
  const cache = new Map();
  function Wrapper({ children }: PropsWithChildren) {
    const form = useForm<AgentBuilderFormData>({
      defaultValues: { skills: [skill], actions: [], additionalSpaces: [] },
    });
    return (
      <SWRConfig value={{ provider: () => cache }}>
        <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
          <FormProvider {...form}>{children}</FormProvider>
        </FetcherProvider>
      </SWRConfig>
    );
  }
  const { result } = renderHook(
    () => ({
      ...useAgentRequestedSpaces({}),
      form: useFormContext<AgentBuilderFormData>(),
    }),
    { wrapper: Wrapper }
  );

  expect(result.current.actionsAndSkillsRequestedSpaceIds).toEqual(
    new Set(["required-space"])
  );
  act(() => result.current.form.setValue("skills", []));
  expect(result.current.actionsAndSkillsRequestedSpaceIds.size).toBe(0);
  expect(fetcherWithBody).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});
