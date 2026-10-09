import { LiveParticipantsAvatars } from "@app/components/file_explorer/LiveParticipantsAvatars";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { LiveParticipantFactory } from "@app/tests/utils/LiveParticipantFactory";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";

const owner = LightWorkspaceFactory.build();

const ADA = LiveParticipantFactory.build({ id: "usr_ada", name: "Ada" });
const BOB = LiveParticipantFactory.build({ id: "usr_bob", name: "Bob" });
const CY = LiveParticipantFactory.build({ id: "usr_cy", name: "Cy" });
const DAN = LiveParticipantFactory.build({ id: "usr_dan", name: "Dan" });

const memberResponse = (id: string, fullName: string) => ({
  member: {
    id,
    firstName: fullName,
    lastName: "",
    fullName,
    email: `${id}@dust.tt`,
    image: `https://images.dust.tt/${id}.png`,
  },
});

// Bob's lookup fails, as a former member's would; the others resolve.
const memberFetcher = (pending?: Promise<void>) =>
  vi.fn(async (url: string) => {
    await pending;
    const id = url.split("/").at(-1) ?? "";
    if (id === BOB.id) {
      throw new Error("Not found");
    }
    return memberResponse(id, `${id.slice(4)} full`);
  });

const renderAvatars = (
  fetcher: ReturnType<typeof memberFetcher>,
  participants = [ADA, BOB]
) => {
  const cache = new Map();
  const wrap = (children: ReactNode) => (
    <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
      <FetcherProvider fetcher={fetcher} fetcherWithBody={vi.fn()}>
        {children}
      </FetcherProvider>
    </SWRConfig>
  );
  const view = render(
    wrap(<LiveParticipantsAvatars owner={owner} participants={participants} />)
  );
  return {
    ...view,
    rerenderWith: (next: typeof participants) =>
      view.rerender(
        wrap(<LiveParticipantsAvatars owner={owner} participants={next} />)
      ),
  };
};

describe("LiveParticipantsAvatars", () => {
  it("shows every participant, with their picture or the session's name", async () => {
    renderAvatars(memberFetcher(), [ADA, BOB, CY, DAN]);

    for (const name of ["ada full", "cy full", "dan full"]) {
      expect(await screen.findByAltText(name)).toBeDefined();
    }
    expect(screen.getByText("B")).toBeDefined();
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it("shows a member as busy while their lookup is pending", async () => {
    let finish = () => undefined as unknown;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const { container } = renderAvatars(memberFetcher(pending), [ADA]);

    expect(container.querySelector(".animate-breathing")).not.toBeNull();
    finish();

    await screen.findByAltText("ada full");
    expect(container.querySelector(".animate-breathing")).toBeNull();
  });

  it("does not look up a member again when someone joins", async () => {
    const fetcher = memberFetcher();
    const { rerenderWith } = renderAvatars(fetcher, [ADA, BOB]);
    await screen.findByAltText("ada full");
    await waitFor(() => expect(screen.getByText("B")).toBeDefined());

    rerenderWith([ADA, BOB, CY]);

    await screen.findByAltText("cy full");
    const lookups = fetcher.mock.calls.map(([url]) => url.split("/").at(-1));
    expect(lookups.filter((id) => id === BOB.id)).toHaveLength(1);
    expect(lookups.filter((id) => id === ADA.id)).toHaveLength(1);
  });
});
