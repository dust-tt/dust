import { ContentNodeTree } from "@app/components/ContentNodeTree";
import type { ContentNode } from "@app/types/connectors/connectors_api";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

describe("ContentNodeTree", () => {
  it("shows the provider missing-rights message", () => {
    render(
      <ContentNodeTree
        useResourcesHook={() => ({
          resources: [],
          isResourcesLoading: false,
          isResourcesError: true,
          resourcesError: {
            type: "connector_oauth_user_missing_rights",
            message:
              "Dust cannot list Zendesk brands because the connected user lacks the required permissions. Re-authorize Zendesk with an admin account.",
          },
        })}
      />
    );

    expect(
      screen.getByText(
        "Dust cannot list Zendesk brands because the connected user lacks the required permissions. Re-authorize Zendesk with an admin account."
      )
    ).toBeInTheDocument();
  });

  it("does not select prevented nodes but can unselect them", () => {
    const selectableNode = {
      childrenCount: 0,
      expandable: false,
      internalId: "selectable",
      lastUpdatedAt: null,
      mimeType: "application/vnd.dust.folder",
      parentInternalId: null,
      permission: "none",
      providerVisibility: null,
      sourceUrl: null,
      title: "Selectable",
      type: "folder",
    } satisfies ContentNode;
    const preventedNode = {
      ...selectableNode,
      internalId: "prevented",
      preventSelection: true,
      title: "Prevented",
    } satisfies ContentNode;
    const setSelectedNodes = vi.fn();

    render(
      <ContentNodeTree
        isTitleFilterEnabled
        selectedNodes={{}}
        setSelectedNodes={setSelectedNodes}
        useResourcesHook={() => ({
          resources: [selectableNode, preventedNode],
          isResourcesLoading: false,
          isResourcesError: false,
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Select All" }));

    const updateSelection = setSelectedNodes.mock.lastCall?.[0];
    expect(updateSelection?.({})).toEqual({
      selectable: {
        isSelected: true,
        node: selectableNode,
        parents: [],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Unselect All" }));

    const clearSelection = setSelectedNodes.mock.lastCall?.[0];
    expect(
      clearSelection?.({
        prevented: {
          isSelected: true,
          node: preventedNode,
          parents: [],
        },
      })
    ).toEqual({
      selectable: {
        isSelected: false,
        node: selectableNode,
        parents: [],
      },
      prevented: {
        isSelected: false,
        node: preventedNode,
        parents: [],
      },
    });
  });
});
