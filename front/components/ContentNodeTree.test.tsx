import { ContentNodeTree } from "@app/components/ContentNodeTree";
import type { ContentNode } from "@app/types/connectors/connectors_api";
import type { FetchChildResourcesError } from "@app/types/connectors/content_nodes";
import { Err, Ok } from "@app/types/shared/result";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
    const fetchChildResources = vi.fn(async () => new Ok([drive]));

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

  it("selects accessible branches when another branch is inaccessible", async () => {
    const inaccessibleSite = makeNode({
      expandable: true,
      internalId: "inaccessible-site",
      preventSelection: true,
      title: "Inaccessible SharePoint site",
    });
    const accessibleSite = makeNode({
      expandable: true,
      internalId: "accessible-site",
      preventSelection: true,
      title: "Accessible SharePoint site",
    });
    const drive = makeNode({
      internalId: "drive",
      parentInternalId: "accessible-site",
      title: "Documents",
    });
    const setSelectedNodes = vi.fn();
    const inaccessibleError: FetchChildResourcesError = {
      type: "resource_inaccessible",
      error: new Error("Access denied"),
    };
    const fetchChildResources = vi.fn(async (parentId: string) =>
      parentId === inaccessibleSite.internalId
        ? new Err(inaccessibleError)
        : new Ok<ContentNode[]>([drive])
    );

    render(
      <ContentNodeTree
        isTitleFilterEnabled
        selectedNodes={{}}
        setSelectedNodes={setSelectedNodes}
        fetchChildResources={fetchChildResources}
        useResourcesHook={() => ({
          resources: [inaccessibleSite, accessibleSite],
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
      drive: {
        isSelected: true,
        node: drive,
        parents: ["accessible-site"],
      },
    });
    expect(
      screen.getByRole("button", { name: "Unselect All" })
    ).toBeInTheDocument();
  });

  it("ignores a Select All result after the search changes", async () => {
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
    const onSelectAllLoadingChange = vi.fn();
    let resolveFetch: ((value: Ok<ContentNode[]>) => void) | undefined;
    const fetchChildResources = vi.fn(
      () =>
        new Promise<Ok<ContentNode[]>>((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(
      <ContentNodeTree
        isTitleFilterEnabled
        selectedNodes={{}}
        setSelectedNodes={setSelectedNodes}
        fetchChildResources={fetchChildResources}
        onSelectAllLoadingChange={onSelectAllLoadingChange}
        useResourcesHook={() => ({
          resources: [site],
          isResourcesLoading: false,
          isResourcesError: false,
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "No match" },
    });

    await act(async () => {
      resolveFetch?.(new Ok([drive]));
    });

    await waitFor(() => {
      expect(onSelectAllLoadingChange).toHaveBeenLastCalledWith(false);
    });
    expect(onSelectAllLoadingChange.mock.calls).toEqual([[true], [false]]);
    expect(setSelectedNodes).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Select All" })).toBeDisabled();
  });
});
