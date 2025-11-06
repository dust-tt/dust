import { Dialog, DialogContent } from "@dust-tt/sparkle";
import {
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  SearchInput,
} from "@dust-tt/sparkle";
import {
  BarChartIcon,
  BookOpenIcon,
  BracesIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  LockIcon,
  MagicIcon,
  PlanetIcon,
  PlusIcon,
  RobotIcon,
  ShapesIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useConversations } from "@app/lib/swr/conversations";
import { useSystemSpace } from "@app/lib/swr/spaces";

type CommandPaletteContextType = {
  openPalette: () => void;
  closePalette: () => void;
};

export const CommandPaletteContext = createContext<CommandPaletteContextType>({
  openPalette: () => undefined,
  closePalette: () => undefined,
});

export function CommandPaletteArea({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const router = useRouter();
  const wId = typeof router.query.wId === "string" ? router.query.wId : null;
  const { conversations } = useConversations({
    workspaceId: wId ?? "",
    options: { disabled: !wId },
  });
  const { systemSpace } = useSystemSpace({
    workspaceId: wId ?? "",
    disabled: !wId,
  });

  const openPalette = useCallback(() => setIsOpen(true), []);
  const closePalette = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const value = useMemo(
    () => ({ openPalette, closePalette }),
    [openPalette, closePalette]
  );

  type PaletteItem = {
    label: string;
    href?: string;
    onSelect?: () => void;
    icon?: React.ComponentType;
  };
  const topLinks: PaletteItem[] = useMemo(() => {
    if (!wId) {
      return [];
    }
    return [
      {
        label: "Manage Agents",
        href: `/w/${wId}/builder/agents`,
        icon: RobotIcon,
      },
      { label: "Spaces", href: `/w/${wId}/spaces`, icon: BookOpenIcon },
      { label: "Admin", href: `/w/${wId}/members`, icon: Cog6ToothIcon },
      {
        label: "Workspace Settings",
        href: `/w/${wId}/workspace`,
        icon: PlanetIcon,
      },
      { label: "Analytics", href: `/w/${wId}/analytics`, icon: BarChartIcon },
      {
        label: "Subscription",
        href: `/w/${wId}/subscription`,
        icon: ShapesIcon,
      },
      {
        label: "Developers · Providers",
        href: `/w/${wId}/developers/providers`,
        icon: ShapesIcon,
      },
      {
        label: "Developers · API Keys",
        href: `/w/${wId}/developers/api-keys`,
        icon: LockIcon,
      },
      {
        label: "Developers · Secrets",
        href: `/w/${wId}/developers/dev-secrets`,
        icon: BracesIcon,
      },
      ...(systemSpace
        ? [
            {
              label: "Tools",
              href: `/w/${wId}/spaces/${systemSpace.sId}/categories/actions`,
              icon: ShapesIcon,
            },
          ]
        : []),
      {
        label: "Connections",
        href: `/w/${wId}/developers/providers`,
        icon: ShapesIcon,
      },
    ];
  }, [wId, systemSpace]);

  const conversationItems: PaletteItem[] = useMemo(() => {
    if (!wId) {
      return [];
    }
    const list = conversations ?? [];
    const sorted = [...list].sort((a, b) => {
      const ta = a.updated ?? a.created ?? 0;
      const tb = b.updated ?? b.created ?? 0;
      return tb - ta;
    });
    return sorted.map((c) => ({
      label:
        c.title && c.title.trim().length > 0
          ? c.title
          : "Untitled conversation",
      href: `/w/${wId}/assistant/${c.sId}`,
      icon: ChatBubbleLeftRightIcon,
    }));
  }, [conversations, wId]);

  const actionItems: PaletteItem[] = useMemo(() => {
    if (!wId) {
      return [];
    }
    return [
      {
        label: "Create agent",
        icon: PlusIcon,
        onSelect: () => {
          void router.push(`/w/${wId}/builder/agents/new`);
          setIsOpen(false);
        },
      },
      {
        label: "Create agent from template",
        icon: MagicIcon,
        onSelect: () => {
          void router.push(`/w/${wId}/builder/agents/create`);
          setIsOpen(false);
        },
      },
      {
        label: "Add MCP tool",
        icon: MagicIcon,
        onSelect: () => {
          const sysId = systemSpace?.sId;
          if (sysId) {
            void router.push(`/w/${wId}/spaces/${sysId}/categories/actions`);
          } else {
            void router.push(`/w/${wId}/spaces`);
          }
          setIsOpen(false);
        },
      },
      {
        label: "Start new conversation",
        icon: ChatBubbleLeftRightIcon,
        onSelect: () => {
          void router.push(`/w/${wId}/assistant/new`);
          setIsOpen(false);
        },
      },
    ];
  }, [router, wId, systemSpace?.sId]);

  const filterByQuery = useCallback(
    (items: PaletteItem[]) => {
      if (!query) {
        return items;
      }
      const q = query.toLowerCase();
      return items.filter((i) =>
        q.split(" ").some((w) => i.label.toLowerCase().includes(w))
      );
    },
    [query]
  );

  const filteredTop = useMemo(
    () => filterByQuery(topLinks),
    [filterByQuery, topLinks]
  );
  const filteredConversations = useMemo(
    () => filterByQuery(conversationItems),
    [filterByQuery, conversationItems]
  );

  const filteredActions = useMemo(
    () => filterByQuery(actionItems),
    [filterByQuery, actionItems]
  );

  const flatResults: PaletteItem[] = useMemo(
    () => [...filteredActions, ...filteredTop, ...filteredConversations],
    [filteredActions, filteredTop, filteredConversations]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isModifier = e.metaKey || e.ctrlKey;
      if (isModifier && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen((prev) => !prev);
        setSelectedIndex(0);
        return;
      }
      if (!isOpen) {
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Tab") {
        e.preventDefault();
        const item = flatResults[selectedIndex];
        if (item?.onSelect) {
          item.onSelect();
        } else if (item?.href) {
          void router.push(item.href);
          setIsOpen(false);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatResults[selectedIndex];
        if (item?.onSelect) {
          item.onSelect();
        } else if (item?.href) {
          void router.push(item.href);
          setIsOpen(false);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, {
        capture: true,
      } as any);
  }, [isOpen, selectedIndex, router, flatResults]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent size="xl">
          <div className="flex flex-col gap-2 p-2 pt-3">
            <SearchInput
              name="command-search"
              placeholder="Search pages and conversations…"
              value={query}
              onChange={(v) => setQuery(v)}
            />
            <div className="max-h-80 overflow-auto rounded-md">
              <NavigationList>
                {filteredActions.length > 0 && (
                  <Section
                    title="Quick actions"
                    items={filteredActions}
                    offset={0}
                    selectedIndex={selectedIndex}
                    onSelect={() => setIsOpen(false)}
                  />
                )}
                {filteredTop.length > 0 && (
                  <Section
                    title="Go to"
                    items={filteredTop}
                    offset={filteredActions.length}
                    selectedIndex={selectedIndex}
                    onSelect={() => setIsOpen(false)}
                  />
                )}
                {filteredConversations.length > 0 && (
                  <Section
                    title="Conversations"
                    items={filteredConversations}
                    offset={filteredActions.length + filteredTop.length}
                    selectedIndex={selectedIndex}
                    onSelect={() => setIsOpen(false)}
                  />
                )}
                {flatResults.length === 0 && (
                  <div className="text-element-700 p-4 text-sm">No results</div>
                )}
              </NavigationList>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </CommandPaletteContext.Provider>
  );
}

function Section({
  title,
  items,
  offset,
  selectedIndex,
  onSelect,
}: {
  title: string;
  items: {
    label: string;
    href?: string;
    onSelect?: () => void;
    icon?: React.ComponentType;
  }[];
  offset: number;
  selectedIndex: number;
  onSelect: () => void;
}) {
  const router = useRouter();
  return (
    <div>
      <NavigationListLabel label={title} isSticky variant="secondary" />
      <div>
        {items.map((item, idx) => {
          const isActive = selectedIndex === offset + idx;
          const icon = item.icon;
          return (
            <NavigationListItem
              key={`${title}-${item.href}`}
              selected={isActive}
              label={item.label}
              href={item.href}
              icon={icon}
              onMouseDown={(e) => {
                e.preventDefault();
                if (item.onSelect) {
                  item.onSelect();
                } else if (item.href) {
                  void router.push(item.href);
                  onSelect();
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
