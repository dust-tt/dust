import {
  Brackets,
  Button,
  CloudArrowLeftRight,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  File02,
  FolderOpen,
  MagicWand02,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  Plus,
  PuzzlePiece01,
  Robot,
  ScrollArea,
  ScrollBar,
  ShapesPlus,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import { type ReactNode } from "react";

import {
  getCompanySpaceIcon,
  openCompanySpaces,
  restrictedCompanySpaces,
} from "../data/companySpaces";
import type { Space } from "../data/types";

// What you build with, rather than what you work in: the pieces an agent is
// made of, then the Spaces that hold the knowledge it reads. Agents, Skills and
// Tools open a screen; Connections and the Spaces only highlight, since the
// sandbox has no pages behind them.

/**
 * The Build rows that have a screen, in the order the nav lists them.
 * Everything else is highlight-only.
 */
export const BUILD_SECTIONS = ["agents", "skills", "tools"] as const;

export type BuildSection = (typeof BUILD_SECTIONS)[number];

export function isBuildSection(item: string): item is BuildSection {
  return BUILD_SECTIONS.includes(item as BuildSection);
}

interface BuildNavProps {
  /** The highlighted row, owned by the story so it can drive the panel. */
  selectedItem: string;
  onSelectItem: (item: string) => void;
  /** Opens the templates view, reached from the "New agent" menu. */
  onNewAgentFromTemplate?: () => void;
}

/** Reveals a row's "New" menu on hover, the way the Work tab does. */
function RowMenu({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "absolute right-2 top-1.5",
        "transition-opacity",
        "[@media(hover:hover)_and_(pointer:fine)]:opacity-0",
        "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100",
        "has-[[data-state=open]]:opacity-100"
      )}
    >
      {children}
    </div>
  );
}

function NewMenuTrigger() {
  return (
    <DropdownMenuTrigger asChild>
      <Button
        size="xs"
        icon={Plus}
        label="New"
        variant="ghost-secondary"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />
    </DropdownMenuTrigger>
  );
}

/** The section header's "New", which creates nothing in the sandbox. */
function NewSpaceButton() {
  return (
    <Button
      size="xs"
      icon={Plus}
      label="New"
      variant="ghost-secondary"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    />
  );
}

export function BuildNav({
  selectedItem,
  onSelectItem,
  onNewAgentFromTemplate,
}: BuildNavProps) {
  const renderSpaceItem = (space: Space) => (
    <NavigationListItem
      key={space.id}
      label={space.name}
      icon={getCompanySpaceIcon(space)}
      selected={selectedItem === space.id}
      onClick={() => onSelectItem(space.id)}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="flex-1">
        <ScrollBar orientation="vertical" size="minimal" />

        <NavigationList className="mx-sidebar-side-spacing pt-3">
          <NavigationListItem
            icon={Robot}
            label="Agents"
            selected={selectedItem === "agents"}
            onClick={() => onSelectItem("agents")}
            keepHoverOnMoreMenu
            moreMenu={
              <RowMenu>
                <DropdownMenu modal={false}>
                  <NewMenuTrigger />
                  <DropdownMenuContent
                    side="bottom"
                    align="center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuLabel label="New agent" />
                    <DropdownMenuItem icon={File02} label="From scratch" />
                    <DropdownMenuItem
                      icon={MagicWand02}
                      label="From template"
                      onClick={onNewAgentFromTemplate}
                    />
                    <DropdownMenuItem icon={Brackets} label="From YAML" />
                  </DropdownMenuContent>
                </DropdownMenu>
              </RowMenu>
            }
          />
          <NavigationListItem
            icon={PuzzlePiece01}
            label="Skills"
            selected={selectedItem === "skills"}
            onClick={() => onSelectItem("skills")}
            keepHoverOnMoreMenu
            moreMenu={
              <RowMenu>
                <DropdownMenu modal={false}>
                  <NewMenuTrigger />
                  <DropdownMenuContent
                    side="bottom"
                    align="center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuLabel label="New skill" />
                    <DropdownMenuItem
                      icon={PuzzlePiece01}
                      label="From scratch"
                    />
                    <DropdownMenuItem icon={FolderOpen} label="From existing" />
                  </DropdownMenuContent>
                </DropdownMenu>
              </RowMenu>
            }
          />
          <NavigationListItem
            icon={ShapesPlus}
            label="Tools"
            selected={selectedItem === "tools"}
            onClick={() => onSelectItem("tools")}
          />
          <NavigationListItem
            icon={CloudArrowLeftRight}
            label="Connections"
            selected={selectedItem === "connections"}
            onClick={() => onSelectItem("connections")}
          />
        </NavigationList>

        <NavigationList className="mx-sidebar-side-spacing mt-2">
          <NavigationListCollapsibleSection
            label="Open Spaces"
            type="collapse"
            defaultOpen={true}
            action={<NewSpaceButton />}
          >
            {openCompanySpaces.map(renderSpaceItem)}
          </NavigationListCollapsibleSection>
        </NavigationList>

        <NavigationList className="mx-sidebar-side-spacing mt-2">
          <NavigationListCollapsibleSection
            label="Restricted Spaces"
            type="collapse"
            defaultOpen={true}
            action={<NewSpaceButton />}
          >
            {restrictedCompanySpaces.map(renderSpaceItem)}
          </NavigationListCollapsibleSection>
        </NavigationList>
      </ScrollArea>
    </div>
  );
}
