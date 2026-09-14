import type { Meta } from "@storybook/react";
import React, { useRef, useState } from "react";

import {
  Button,
  Card,
  NavigationList,
  NavigationListItem,
  ScrollArea,
  ScrollBar,
  SearchInput,
  SidebarLayout,
  type SidebarLayoutRef,
  LayoutLeft,
  LayoutRight,
} from "../index_with_tw_base";

const meta = {
  title: "Lab/SidebarLayout",
  tags: ["!manifest", "a11y-issues"],
  component: SidebarLayout,
  parameters: {
    docs: {
      description: {
        component: `An app-shell layout pairing a collapsible side panel with a main content area. It exposes an imperative handle (**SidebarLayoutRef**) so you can toggle or collapse the sidebar programmatically, making it suitable for navigation rails alongside scrollable content.

**When to use**
- For top-level page scaffolding that needs a persistent, collapsible sidebar next to a main region.

**Guidelines**
- Drive collapse/expand through the **SidebarLayoutRef** handle and reflect state in the toggle control's icon.
- Compose the sidebar from **NavigationList** / **NavigationListItem** and wrap long content in **ScrollArea** so each region scrolls independently.`,
      },
    },
  },
} satisfies Meta<typeof SidebarLayout>;

export default meta;

// Sample sidebar content
const SampleSidebar = ({
  onToggle,
  isCollapsed,
}: {
  onToggle?: () => void;
  isCollapsed?: boolean;
}) => (
  <div className="flex h-full flex-col border-r border-border bg-muted-background">
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
      <div className="text-sm font-semibold text-foreground">Sidebar</div>
      {onToggle && (
        <Button
          variant="ghost-secondary"
          size="icon"
          icon={isCollapsed ? LayoutRight : LayoutLeft}
          onClick={onToggle}
        />
      )}
    </div>
    <ScrollArea className="flex-1">
      <ScrollBar orientation="vertical" size="minimal" />
      <div className="p-2">
        <SearchInput
          name="search"
          value=""
          onChange={() => {}}
          placeholder="Search..."
          className="mb-2"
        />
        <NavigationList>
          <NavigationListItem label="Inbox" />
          <NavigationListItem label="Drafts" />
          <NavigationListItem label="Sent" />
          <NavigationListItem label="Archive" />
          <NavigationListItem label="Trash" />
        </NavigationList>
      </div>
    </ScrollArea>
  </div>
);

// Sample content
const SampleContent = () => (
  <div className="flex h-full w-full flex-col bg-background">
    <div className="border-b border-border p-4">
      <h1 className="heading-xl text-foreground">Main Content</h1>
      <p className="text-sm text-muted-foreground">
        This is the main content area. Resize the sidebar by dragging the
        handle.
      </p>
    </div>
    <div className="flex-1 overflow-y-auto p-4">
      <div className="space-y-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Card key={i} className="p-4">
            <h2 className="heading-lg mb-2 text-foreground">Card {i + 1}</h2>
            <p className="text-sm text-muted-foreground">
              This is card content {i + 1}. The sidebar can be resized, toggled,
              and will reveal on hover when collapsed.
            </p>
          </Card>
        ))}
      </div>
    </div>
  </div>
);

export const Default = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="h-[600px] w-full">
      <SidebarLayout
        sidebar={<SampleSidebar />}
        content={<SampleContent />}
        onSidebarToggle={setIsCollapsed}
      />
    </div>
  );
};

// Complex sidebar component
const ComplexSidebar = ({
  onToggle,
  isCollapsed,
  searchValue,
  onSearchChange,
  onNavigate,
}: {
  onToggle?: () => void;
  isCollapsed?: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onNavigate: (item: string) => void;
}) => (
  <div className="flex h-full flex-col border-r border-border bg-muted-background">
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
      <div className="text-sm font-semibold text-foreground">Navigation</div>
      {onToggle && (
        <Button
          variant="ghost-secondary"
          size="icon"
          icon={isCollapsed ? LayoutRight : LayoutLeft}
          onClick={onToggle}
        />
      )}
    </div>
    <ScrollArea className="flex-1">
      <ScrollBar orientation="vertical" size="minimal" />
      <div className="p-3">
        <SearchInput
          name="search"
          value={searchValue}
          onChange={onSearchChange}
          placeholder="Search..."
          className="mb-3"
        />
        <NavigationList>
          <NavigationListItem
            label="Dashboard"
            onClick={() => onNavigate("Dashboard")}
          />
          <NavigationListItem
            label="Projects"
            onClick={() => onNavigate("Projects")}
          />
          <NavigationListItem label="Team" onClick={() => onNavigate("Team")} />
          <NavigationListItem
            label="Settings"
            onClick={() => onNavigate("Settings")}
          />
          <NavigationListItem label="Help" onClick={() => onNavigate("Help")} />
        </NavigationList>
        <div className="mt-4 border-t border-border pt-4">
          <NavigationList>
            <NavigationListItem
              label="Recent"
              onClick={() => onNavigate("Recent")}
            />
            <NavigationListItem
              label="Favorites"
              onClick={() => onNavigate("Favorites")}
            />
            <NavigationListItem
              label="Archive"
              onClick={() => onNavigate("Archive")}
            />
          </NavigationList>
        </div>
      </div>
    </ScrollArea>
  </div>
);

// Complex content component
const ComplexContent = ({ selectedItem }: { selectedItem: string | null }) => (
  <div className="flex h-full w-full flex-col bg-background">
    <div className="border-b border-border p-6">
      <h1 className="heading-2xl mb-2 text-foreground">
        Complex Layout Example
      </h1>
      <p className="text-sm text-muted-foreground">
        This example demonstrates a more realistic sidebar layout with
        navigation items and content cards.
        {selectedItem && (
          <span className="ml-2 font-semibold text-foreground">
            Selected: {selectedItem}
          </span>
        )}
      </p>
    </div>
    <div className="flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <Card key={i} className="p-4">
            <h3 className="heading-md mb-2 text-foreground">Project {i + 1}</h3>
            <p className="text-xs text-muted-foreground">
              Description for project {i + 1}. This card demonstrates how
              content flows in the main area.
            </p>
          </Card>
        ))}
      </div>
    </div>
  </div>
);

export const ComplexExample = () => {
  const sidebarLayoutRef = useRef<SidebarLayoutRef>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  const handleToggle = () => {
    sidebarLayoutRef.current?.toggle();
  };

  const handleNavigate = (item: string) => {
    setSelectedItem(item);
  };

  return (
    <div className="h-[700px] w-full">
      <SidebarLayout
        ref={sidebarLayoutRef}
        sidebar={
          <ComplexSidebar
            onToggle={handleToggle}
            isCollapsed={isCollapsed}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            onNavigate={handleNavigate}
          />
        }
        content={<ComplexContent selectedItem={selectedItem} />}
        defaultSidebarWidth={280}
        minSidebarWidth={200}
        maxSidebarWidth={400}
        collapsible={true}
        onSidebarToggle={setIsCollapsed}
      />
    </div>
  );
};
