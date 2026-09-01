import {
  CapabilitiesPicker,
  CapabilitySetupDialog,
} from "@app/components/assistant/CapabilitiesPicker";
import {
  DEFAULT_MCP_ACTION_VERSION,
  DEFAULT_MCP_SERVER_ICON,
} from "@app/lib/actions/constants";
import type { MCPServerType, MCPServerViewLightType } from "@app/lib/api/mcp";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

const owner = {
  id: 0,
  sId: "wId",
  name: "Workspace",
  role: "admin",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  metadata: null,
  metronomeCustomerId: null,
  sharingPolicy: "all_scopes",
  regionalModelsOnly: false,
} satisfies WorkspaceType;

const uninstalledServer = {
  name: "notion",
  version: DEFAULT_MCP_ACTION_VERSION,
  description: "Search Notion pages.",
  sId: "server-id",
  icon: DEFAULT_MCP_SERVER_ICON,
  authorization: null,
  tools: [],
  availability: "manual",
  allowMultipleInstances: false,
  documentationUrl: null,
} satisfies MCPServerType;

vi.mock(import("@app/lib/swr/spaces"), () => ({
  useSpaces: () => ({
    spaces: [],
    isSpacesLoading: false,
    isSpacesError: null,
    mutate: vi.fn(async () => undefined),
  }),
}));

const createdServerView = {
  sId: "view-id",
  name: null,
  description: "Search Notion pages.",
  server: {
    sId: "server-id",
    name: "notion",
    description: "Search Notion pages.",
    icon: DEFAULT_MCP_SERVER_ICON,
    tools: [],
  },
} satisfies MCPServerViewLightType;

vi.mock(import("@app/lib/swr/mcp_servers"), () => ({
  useJITMCPServerViewsFromSpaces: () => ({
    serverViews: [],
    isLoading: false,
    isError: null,
    // The created view only shows up in the refetch that follows the creation.
    mutateServerViews: vi.fn(async () => ({
      success: true,
      serverViews: [createdServerView],
    })),
  }),
  useAvailableMCPServers: () => ({
    availableMCPServers: [{ ...uninstalledServer, views: [] }],
    isAvailableMCPServersLoading: false,
    isAvailableMCPServersError: null,
    mutateAvailableMCPServers: vi.fn(async () => undefined),
  }),
}));

vi.mock(import("@app/lib/swr/skill_configurations"), () => ({
  useSkills: () => ({
    skills: [],
    isSkillsError: false,
    isSkillsLoading: false,
    mutateSkills: vi.fn(async () => undefined),
  }),
}));

vi.mock(import("@app/lib/swr/useIsMobile"), () => ({
  useIsMobile: () => false,
}));

vi.mock(import("@app/components/shared/CapabilityDetailsSheets"), () => ({
  CapabilityDetailsSheets: () => <div />,
}));

// Stands in for the real dialog, which reports its close right after handing over the created
// server, before the refetch that resolves its view has settled.
vi.mock(
  import("@app/components/actions/mcp/create/CreateMCPServerDialog"),
  () => ({
    CreateMCPServerDialog: ({
      setMCPServerToShow,
      setIsOpen,
    }: {
      setMCPServerToShow: (server: MCPServerType) => void;
      setIsOpen: (isOpen: boolean) => void;
    }) => (
      <button
        type="button"
        onClick={() => {
          setMCPServerToShow(uninstalledServer);
          setIsOpen(false);
        }}
      >
        Save
      </button>
    ),
  })
);

// Mirrors how the input bar composes the picker: as a page of the "+" menu, with the
// configuration dialog it asks for hosted outside of the menu.
function PlusMenuHarness() {
  const [serverToSetup, setServerToSetup] = useState<MCPServerType | null>(
    null
  );
  const [isOpen, setIsOpen] = useState(false);
  const [page, setPage] = useState<"root" | "capabilities">("root");

  return (
    <>
      <DropdownMenu
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (open) {
            setPage("root");
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button label="More" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {page === "root" ? (
            <DropdownMenuItem
              label="Capabilities"
              onSelect={(event) => event.preventDefault()}
              onClick={() => setPage("capabilities")}
            />
          ) : (
            <CapabilitiesPicker
              type="panel"
              owner={owner}
              user={null}
              selectedMCPServerViews={[]}
              onSelect={vi.fn()}
              onSkillSelect={vi.fn()}
              onSetupServer={setServerToSetup}
              onBack={() => setPage("root")}
              onClose={() => setIsOpen(false)}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {serverToSetup && (
        <div data-testid="setup-dialog">Configure {serverToSetup.name}</div>
      )}
    </>
  );
}

// Same shape as InputBarButtons: the dialog is dropped as soon as it reports its close.
function SetupHost({
  onServerViewAdded,
}: {
  onServerViewAdded: (serverView: MCPServerViewLightType) => void;
}) {
  const [server, setServer] = useState<MCPServerType | null>(uninstalledServer);

  return (
    server && (
      <CapabilitySetupDialog
        owner={owner}
        server={server}
        onClose={() => setServer(null)}
        onServerViewAdded={onServerViewAdded}
      />
    )
  );
}

describe("CapabilitiesPicker", () => {
  beforeAll(() => {
    // Radix relies on browser APIs that jsdom does not implement.
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it("keeps the tool configuration dialog mounted once the menu closes", async () => {
    const user = userEvent.setup();
    render(<PlusMenuHarness />);

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByText("Capabilities"));

    fireEvent.click(await screen.findByText("Notion"));

    await waitFor(() =>
      expect(screen.queryByText("Search capabilities")).not.toBeInTheDocument()
    );
    expect(screen.getByTestId("setup-dialog")).toBeInTheDocument();
  });

  it("attaches the created tool after its host unmounted it", async () => {
    const user = userEvent.setup();
    const onServerViewAdded = vi.fn();

    render(<SetupHost onServerViewAdded={onServerViewAdded} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      screen.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(onServerViewAdded).toHaveBeenCalledWith(createdServerView)
    );
  });
});
