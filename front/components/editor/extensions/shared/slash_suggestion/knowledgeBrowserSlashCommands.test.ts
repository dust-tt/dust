import type { KnowledgeBrowserItem } from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import { SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/slash_suggestion/attachContextSlashCommand";
import {
  getKnowledgeBrowserBreadcrumbItems,
  isNavigateKnowledgeBrowserSlashCommand,
  NAVIGATE_KNOWLEDGE_BROWSER_ACTION,
  toKnowledgeBrowserSlashCommands,
} from "@app/components/editor/extensions/shared/slash_suggestion/knowledgeBrowserSlashCommands";
import {
  makeContentNodeFixture,
  makeDataSourceViewFixture,
  makeSpaceFixture,
} from "@app/tests/utils/content_node_test_fixtures";
import { DATA_SOURCE_NODE_ID } from "@app/types/core/content_node";
import { describe, expect, it, vi } from "vitest";

const space = makeSpaceFixture({ sId: "space1", name: "Company Data" });

function makeNode(internalId: string, expandable: boolean) {
  return makeContentNodeFixture(internalId, {
    expandable,
    type: expandable ? "folder" : "document",
  });
}

const Icon = () => null;

describe("toKnowledgeBrowserSlashCommands", () => {
  it("navigates into containers and attaches leaf nodes", () => {
    const folder = makeNode("folder", true);
    const doc = makeNode("doc", false);
    const items: KnowledgeBrowserItem[] = [
      {
        kind: "space",
        group: "spaces",
        id: "space1",
        title: "S",
        icon: Icon,
        space,
      },
      {
        kind: "node",
        id: "folder",
        title: "F",
        icon: Icon,
        node: folder,
        expandable: true,
      },
      {
        kind: "node",
        id: "doc",
        title: "D",
        icon: Icon,
        node: doc,
        expandable: false,
      },
    ];

    const onAttachNode = vi.fn();
    const commands = toKnowledgeBrowserSlashCommands(items, { onAttachNode });

    expect(commands.map((command) => command.action)).toEqual([
      NAVIGATE_KNOWLEDGE_BROWSER_ACTION,
      NAVIGATE_KNOWLEDGE_BROWSER_ACTION,
      SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION,
    ]);
    expect(isNavigateKnowledgeBrowserSlashCommand(commands[0])).toBe(true);
    expect(isNavigateKnowledgeBrowserSlashCommand(commands[2])).toBe(false);
    expect(commands[2].data).toEqual({
      selection: { kind: "knowledge", node: doc },
    });
    expect(commands[0].endAction).toBeUndefined();
    commands[1].endAction?.onSelect();
    expect(onAttachNode).toHaveBeenCalledWith(folder);
  });
});

describe("toKnowledgeBrowserSlashCommands data source rows", () => {
  it("adds an Add action attaching the view's root node", () => {
    const dataSourceView = makeDataSourceViewFixture("dsv1");
    const onAttachNode = vi.fn();
    const [command] = toKnowledgeBrowserSlashCommands(
      [
        {
          kind: "data_source",
          id: "dsv1",
          title: "Adele",
          icon: () => null,
          dataSourceView,
        },
      ],
      { onAttachNode }
    );

    expect(command.action).toBe(NAVIGATE_KNOWLEDGE_BROWSER_ACTION);
    command.endAction?.onSelect();
    expect(onAttachNode).toHaveBeenCalledWith(
      expect.objectContaining({
        dataSourceView,
        internalId: DATA_SOURCE_NODE_ID,
        type: "folder",
      })
    );
  });
});

describe("getKnowledgeBrowserBreadcrumbItems", () => {
  it("labels the root and navigates to the clicked index", () => {
    const navigateTo = vi.fn();
    const history: NavigationHistoryEntryType[] = [
      { type: "root" },
      { type: "space", space },
      { type: "category", category: "folder" },
    ];

    const items = getKnowledgeBrowserBreadcrumbItems(history, navigateTo);

    expect(items.map((item) => item.label)).toEqual([
      "All",
      "Company Data",
      "Folders",
    ]);
    items[1].onClick?.();
    expect(navigateTo).toHaveBeenCalledWith(1);
  });
});
