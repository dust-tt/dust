import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import {
  Button,
  Card,
  NavigationList,
  NavigationListItem,
  ScrollArea,
  ScrollBar,
  SearchInput,
  SidebarLayout,
  SidebarLeftCloseIcon,
  SidebarLeftOpenIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Layouts/SidebarLayout",
  component: SidebarLayout,
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
  <div className="s-flex s-h-full s-flex-col s-border-r s-border-border s-bg-muted-background dark:s-border-border-night dark:s-bg-muted-background-night">
    <div className="s-flex s-items-center s-justify-between s-gap-2 s-border-b s-border-border s-py-2 s-px-3 dark:s-border-border-night">
      <div className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
        Sidebar
      </div>
      {onToggle && (
        <Button
          variant="ghost-secondary"
          size="mini"
          icon={isCollapsed ? SidebarLeftOpenIcon : SidebarLeftCloseIcon}
          onClick={onToggle}
        />
      )}
    </div>
    <ScrollArea className="s-flex-1">
      <ScrollBar orientation="vertical" size="minimal" />
      <div className="s-p-2">
        <SearchInput
          name="search"
          value=""
          onChange={() => {}}
          placeholder="Search..."
          className="s-mb-2"
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
  <div className="s-flex s-h-full s-w-full s-flex-col s-bg-background">
    <div className="s-border-b s-border-border s-p-4 dark:s-border-border-night">
      <h1 className="s-heading-xl s-text-foreground dark:s-text-foreground-night">
        Main Content
      </h1>
      <p className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
        This is the main content area. Resize the sidebar by dragging the handle.
      </p>
    </div>
    <div className="s-flex-1 s-overflow-y-auto s-p-4">
      <div className="s-space-y-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Card key={i} className="s-p-4">
            <h2 className="s-heading-lg s-mb-2 s-text-foreground dark:s-text-foreground-night">
              Card {i + 1}
            </h2>
            <p className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
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
    <div className="s-h-[600px] s-w-full">
      <SidebarLayout
        sidebar={<SampleSidebar />}
        content={<SampleContent />}
        onSidebarToggle={setIsCollapsed}
      />
    </div>
  );
};

export const WithCustomSizes = () => {
  return (
    <div className="s-h-[600px] s-w-full">
      <SidebarLayout
        sidebar={<SampleSidebar />}
        content={<SampleContent />}
        defaultSidebarWidth={320}
        minSidebarWidth={250}
        maxSidebarWidth={500}
      />
    </div>
  );
};

export const Collapsible = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="s-h-[600px] s-w-full">
      <SidebarLayout
        sidebar={
          <SampleSidebar
            onToggle={() => setIsCollapsed(!isCollapsed)}
            isCollapsed={isCollapsed}
          />
        }
        content={<SampleContent />}
        collapsible={true}
        onSidebarToggle={setIsCollapsed}
      />
    </div>
  );
};

export const WithHoverReveal = () => {
  const [isCollapsed, setIsCollapsed] = useState(true);

  return (
    <div className="s-h-[600px] s-w-full">
      <div className="s-mb-4 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
        Sidebar is collapsed. Hover over the left edge to reveal it.
      </div>
      <SidebarLayout
        sidebar={<SampleSidebar />}
        content={<SampleContent />}
        collapsible={true}
        onSidebarToggle={setIsCollapsed}
      />
    </div>
  );
};

export const NonCollapsible = () => {
  return (
    <div className="s-h-[600px] s-w-full">
      <SidebarLayout
        sidebar={<SampleSidebar />}
        content={<SampleContent />}
        collapsible={false}
      />
    </div>
  );
};

export const ComplexExample = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const ComplexSidebar = () => (
    <div className="s-flex s-h-full s-flex-col s-border-r s-border-border s-bg-muted-background dark:s-border-border-night dark:s-bg-muted-background-night">
      <div className="s-flex s-items-center s-justify-between s-gap-2 s-border-b s-border-border s-py-2 s-px-3 dark:s-border-border-night">
        <div className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
          Navigation
        </div>
        <Button
          variant="ghost-secondary"
          size="mini"
          icon={isCollapsed ? SidebarLeftOpenIcon : SidebarLeftCloseIcon}
          onClick={() => setIsCollapsed(!isCollapsed)}
        />
      </div>
      <ScrollArea className="s-flex-1">
        <ScrollBar orientation="vertical" size="minimal" />
        <div className="s-p-3">
          <SearchInput
            name="search"
            value=""
            onChange={() => {}}
            placeholder="Search..."
            className="s-mb-3"
          />
          <NavigationList>
            <NavigationListItem label="Dashboard" />
            <NavigationListItem label="Projects" />
            <NavigationListItem label="Team" />
            <NavigationListItem label="Settings" />
            <NavigationListItem label="Help" />
          </NavigationList>
          <div className="s-mt-4 s-border-t s-border-border s-pt-4 dark:s-border-border-night">
            <NavigationList>
              <NavigationListItem label="Recent" />
              <NavigationListItem label="Favorites" />
              <NavigationListItem label="Archive" />
            </NavigationList>
          </div>
        </div>
      </ScrollArea>
    </div>
  );

  const ComplexContent = () => (
    <div className="s-flex s-h-full s-w-full s-flex-col s-bg-background">
      <div className="s-border-b s-border-border s-p-6 dark:s-border-border-night">
        <h1 className="s-heading-2xl s-mb-2 s-text-foreground dark:s-text-foreground-night">
          Complex Layout Example
        </h1>
        <p className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
          This example demonstrates a more realistic sidebar layout with navigation
          items and content cards.
        </p>
      </div>
      <div className="s-flex-1 s-overflow-y-auto s-p-6">
        <div className="s-grid s-grid-cols-1 s-gap-4 md:s-grid-cols-2 lg:s-grid-cols-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Card key={i} className="s-p-4">
              <h3 className="s-heading-md s-mb-2 s-text-foreground dark:s-text-foreground-night">
                Project {i + 1}
              </h3>
              <p className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                Description for project {i + 1}. This card demonstrates how content
                flows in the main area.
              </p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="s-h-[700px] s-w-full">
      <SidebarLayout
        sidebar={<ComplexSidebar />}
        content={<ComplexContent />}
        defaultSidebarWidth={280}
        minSidebarWidth={200}
        maxSidebarWidth={400}
        collapsible={true}
        onSidebarToggle={setIsCollapsed}
      />
    </div>
  );
};

