import { DiscoverableSkillsList } from "@app/components/skills/DiscoverableSkillsList";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import type { FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

const feature = vi.hoisted(() => ({ enabled: true }));
vi.mock(import("@app/lib/auth/AuthContext"), () => ({
  useFeatureFlags: () => ({
    featureFlags: [],
    hasFeature: () => feature.enabled,
  }),
}));

const owner = LightWorkspaceFactory.build();

function renderList() {
  const fetcher = vi.fn(async () => ({
    skills: [
      {
        sId: "legacy",
        name: "Legacy skill",
        userFacingDescription: "",
        icon: null,
        editedBy: null,
      },
    ],
  }));
  const fetcherWithBody = vi.fn<FetcherWithBodyFn>(async ([, body]) => {
    const offset = "offset" in body ? body.offset : 0;
    return {
      skills: [
        {
          sId: offset ? "second" : "first",
          name: offset ? "Second skill" : "First skill",
          userFacingDescription: "",
          icon: null,
          editedBy: null,
        },
      ],
      total: 51,
      hasMore: !offset,
      facets: {},
    };
  });
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
        <DiscoverableSkillsList owner={owner} />
      </FetcherProvider>
    </SWRConfig>
  );
  return { fetcher, fetcherWithBody };
}

describe("DiscoverableSkillsList", () => {
  beforeEach(() => {
    feature.enabled = true;
  });

  it("pages through discoverable skills without loading the legacy list", async () => {
    const { fetcher, fetcherWithBody } = renderList();
    await screen.findByText("First skill");
    expect(fetcher).not.toHaveBeenCalled();
    expect(fetcherWithBody).toHaveBeenCalledWith([
      `/api/w/${owner.sId}/skills/search`,
      expect.objectContaining({
        availability: ["users_and_agents"],
        offset: 0,
      }),
      "POST",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Second skill");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      `/api/w/${owner.sId}/skills/search`,
      expect.objectContaining({ offset: 50 }),
      "POST",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(screen.getByText("First skill")).toBeVisible());
  });

  it("keeps the legacy listing when search is disabled", async () => {
    feature.enabled = false;
    const { fetcherWithBody } = renderList();
    await screen.findByText("Legacy skill");
    expect(fetcherWithBody).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Next" })
    ).not.toBeInTheDocument();
  });
});
