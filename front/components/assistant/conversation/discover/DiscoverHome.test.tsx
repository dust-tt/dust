import { DiscoverHome } from "@app/components/assistant/conversation/discover/DiscoverHome";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";

describe("DiscoverHome", () => {
  it("renders and selects discovery skill targets without fetching the workspace skill list", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
      globalGroup,
    } = await createResourceTest({});
    const skill = await SkillFactory.create(auth, {
      name: "Weekly report",
      addCurrentUserAsEditor: true,
    });
    const item = {
      type: "skill" as const,
      target: { ...skill.toDiscoveryJSON(), authors: [user.fullName()] },
    };
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/assistant/agent_configurations?")) {
        return { agentConfigurations: [] };
      }
      if (url.endsWith("/discovery/featured")) {
        return {
          items: [{ ...item, pin: { groupId: globalGroup.sId, position: 0 } }],
        };
      }
      if (url.endsWith("/discovery/for_you")) {
        return { items: [item, item] };
      }
      if (url.endsWith("/discovery/trending")) {
        return { items: [item] };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const onSkillClick = vi.fn();

    render(
      <SWRConfig
        value={{ provider: () => new Map(), shouldRetryOnError: false }}
      >
        <FetcherProvider fetcher={fetcher} fetcherWithBody={vi.fn()}>
          <DiscoverHome
            owner={workspace}
            onAgentClick={vi.fn()}
            onSkillClick={onSkillClick}
            onDetails={vi.fn()}
            onFindMore={vi.fn()}
          />
        </FetcherProvider>
      </SWRConfig>
    );

    const useButtons = await screen.findAllByRole("button", {
      name: "Use Weekly report",
    });
    expect(useButtons).toHaveLength(2);
    expect(screen.getAllByText(user.fullName())).toHaveLength(3);
    await userEvent.click(useButtons[0]);

    expect(onSkillClick).toHaveBeenCalledWith({
      sId: skill.sId,
      name: skill.name,
      icon: skill.icon,
      userFacingDescription: skill.userFacingDescription,
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls.map(([url]) => url)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("/skills?")])
    );
  });
});
