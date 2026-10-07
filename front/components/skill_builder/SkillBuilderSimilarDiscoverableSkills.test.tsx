import type { SkillBuilderFormData } from "@app/components/skill_builder/skillBuilderFormSchema";
import { SkillBuilderSimilarDiscoverableSkills } from "@app/components/skill_builder/SkillBuilderSimilarDiscoverableSkills";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { SWRConfig } from "swr";
import { expect, it, vi } from "vitest";

const owner = LightWorkspaceFactory.build();
vi.mock("@app/components/skill_builder/SkillBuilderContext", () => ({
  useSkillBuilderContext: () => ({ owner, skillId: null }),
}));

vi.mock("@app/lib/platform", () => ({
  LinkWrapper: ({ children }: { children: ReactNode }) => children,
}));

it("displays the skills returned by the similarity check without a second lookup", async () => {
  const fetcher = vi.fn().mockResolvedValue({
    similar_skills: ["similar-skill"],
    skills: [
      { sId: "similar-skill", name: "Similar skill", icon: null, editedBy: 1 },
    ],
  });
  const fetcherWithBody = vi.fn();
  const cache = new Map();
  function Wrapper() {
    const form = useForm<SkillBuilderFormData>({
      defaultValues: {
        availability: "users_and_agents",
        agentFacingDescription: "Find existing similar skills",
      },
    });
    return (
      <SWRConfig value={{ provider: () => cache }}>
        <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
          <FormProvider {...form}>
            <SkillBuilderSimilarDiscoverableSkills />
          </FormProvider>
        </FetcherProvider>
      </SWRConfig>
    );
  }
  render(<Wrapper />);
  await waitFor(() => expect(screen.getByText("Similar skill")).toBeVisible());
  expect(fetcherWithBody).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe(`/api/w/${owner.sId}/skills/similar`);
});
