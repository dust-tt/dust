import { InputBarPlusMenu } from "@app/components/assistant/conversation/input_bar/InputBarPlusMenu";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import type { SelectableConversationSpaceType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/components/shared/CapabilityDetailsSheets"), () => ({
  CapabilityDetailsSheets: () => <div />,
}));

const owner = {
  id: 0,
  sId: "wId",
  name: "Workspace",
  role: "user",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  metadata: null,
  metronomeCustomerId: null,
  sharingPolicy: "all_scopes",
  regionalModelsOnly: false,
} satisfies WorkspaceType;

const spaces = [
  {
    sId: "space-1",
    name: "Engineering",
    kind: "regular",
    managementMode: "manual",
    createdAt: 0,
    updatedAt: 0,
    groupIds: [],
    isRestricted: false,
    selected: false,
  },
  {
    sId: "space-2",
    name: "Marketing",
    kind: "regular",
    managementMode: "manual",
    createdAt: 0,
    updatedAt: 0,
    groupIds: [],
    isRestricted: false,
    selected: false,
  },
] satisfies SelectableConversationSpaceType[];

function renderPlusMenu() {
  return render(
    <InputBarPlusMenu
      owner={owner}
      user={null}
      buttonSize="xs"
      disabled={false}
      hideCapabilities
      hideAttachments
      selectedMCPServerViews={[]}
      onMCPServerViewSelect={vi.fn()}
      onSkillSelect={vi.fn()}
      onSetupServer={vi.fn()}
      fileUploaderService={{} as FileUploaderService}
      onNodeSelect={vi.fn()}
      onNodeUnselect={vi.fn()}
      attachedNodes={[]}
      selectedSpaceIds={[]}
      onSelectedSpaceIdsChange={vi.fn()}
      spaces={spaces}
    />
  );
}

describe("InputBarPlusMenu", () => {
  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it("swaps the menu for the picker page and back", async () => {
    const user = userEvent.setup();
    renderPlusMenu();

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByText("Spaces"));

    expect(await screen.findByText("Additional Spaces")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));

    await waitFor(() =>
      expect(screen.queryByText("Additional Spaces")).not.toBeInTheDocument()
    );
    expect(screen.getByText("Spaces")).toBeInTheDocument();
  });

  it("reopens on the root page", async () => {
    const user = userEvent.setup();
    renderPlusMenu();

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByText("Spaces"));
    expect(await screen.findByText("Additional Spaces")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "More" }));

    expect(await screen.findByText("Spaces")).toBeInTheDocument();
    expect(screen.queryByText("Additional Spaces")).not.toBeInTheDocument();
  });
});
