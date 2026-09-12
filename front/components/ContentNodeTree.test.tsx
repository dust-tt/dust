import { ContentNodeTree } from "@app/components/ContentNodeTree";
import type { ContentNode } from "@app/types/connectors/connectors_api";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

function makeNode(
  overrides: Partial<ContentNode> & Pick<ContentNode, "internalId" | "title">
): ContentNode {
  return {
    childrenCount: 0,
    expandable: false,
    lastUpdatedAt: null,
    mimeType: "application/vnd.dust.folder",
    parentInternalId: null,
    permission: "none",
    providerVisibility: null,
    sourceUrl: null,
    type: "folder",
    ...overrides,
  };
}

describe("ContentNodeTree", () => {
  it("does not select prevented nodes but can unselect them", async () => {
    const selectableNode = makeNode({
      internalId: "selectable",
      title: "Selectable",
    });
    const preventedNode = makeNode({
      internalId: "prevented",
      preventSelection: true,
      title: "Prevented",
    });
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

    await waitFor(() => {
      expect(setSelectedNodes).toHaveBeenCalled();
    });

    const updateSelection = setSelectedNodes.mock.lastCall?.[0];
    expect(updateSelection?.({})).toEqual({
      selectable: {
        isSelected: true,
        node: selectableNode,
        parents: [],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Unselect All" }));

    await waitFor(() => {
      expect(setSelectedNodes).toHaveBeenCalledTimes(2);
    });

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

  it("selects children of prevented containers via fetchChildResources", async () => {
    const site = makeNode({
      expandable: true,
      internalId: "site",
      preventSelection: true,
      title: "SharePoint site",
    });
    const drive = makeNode({
      internalId: "drive",
      parentInternalId: "site",
      title: "Documents",
    });
    const setSelectedNodes = vi.fn();
    const fetchChildResources = vi.fn(async () => [drive]);

    render(
      <ContentNodeTree
        isTitleFilterEnabled
        selectedNodes={{}}
        setSelectedNodes={setSelectedNodes}
        fetchChildResources={fetchChildResources}
        useResourcesHook={() => ({
          resources: [site],
          isResourcesLoading: false,
          isResourcesError: false,
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Select All" }));

    await waitFor(() => {
      expect(fetchChildResources).toHaveBeenCalledWith("site");
      expect(setSelectedNodes).toHaveBeenCalled();
    });

    const updateSelection = setSelectedNodes.mock.lastCall?.[0];
    expect(updateSelection?.({})).toEqual({
      drive: {
        isSelected: true,
        node: drive,
        parents: ["site"],
      },
    });
  });
});
