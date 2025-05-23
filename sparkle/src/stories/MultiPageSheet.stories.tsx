import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import { Button } from "@sparkle/components/Button";
import {
  MultiPageSheet,
  MultiPageSheetContent,
  type MultiPageSheetPage,
  MultiPageSheetTrigger,
} from "@sparkle/components/MultiPageSheet";
import { CogIcon,DocumentTextIcon, UserIcon } from "@sparkle/icons/app";

const meta: Meta<typeof MultiPageSheetContent> = {
  title: "Primitives/MultiPageSheet",
  component: MultiPageSheetContent,
};

export default meta;
type Story = StoryObj<typeof meta>;

const samplePages: MultiPageSheetPage[] = [
  {
    id: "profile",
    title: "User Profile",
    description: "Manage your personal information",
    icon: UserIcon,
    content: (
      <div className="s-space-y-4">
        <div>
          <h3 className="s-mb-2 s-text-lg s-font-semibold">
            Personal Information
          </h3>
          <p className="s-text-sm s-text-muted-foreground">
            Update your profile details and preferences.
          </p>
        </div>
        <div className="s-space-y-3">
          <div>
            <label className="s-text-sm s-font-medium">Full Name</label>
            <input
              type="text"
              className="s-mt-1 s-w-full s-rounded-md s-border s-px-3 s-py-2"
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="s-text-sm s-font-medium">Email</label>
            <input
              type="email"
              className="s-mt-1 s-w-full s-rounded-md s-border s-px-3 s-py-2"
              placeholder="john@example.com"
            />
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "documents",
    title: "Documents",
    description: "Manage your uploaded files",
    icon: DocumentTextIcon,
    content: (
      <div className="s-space-y-4">
        <div>
          <h3 className="s-mb-2 s-text-lg s-font-semibold">File Management</h3>
          <p className="s-text-sm s-text-muted-foreground">
            Upload, organize, and manage your documents.
          </p>
        </div>
        <div className="s-space-y-2">
          <div className="s-flex s-items-center s-justify-between s-rounded-md s-border s-p-3">
            <span className="s-text-sm">document1.pdf</span>
            <Button label="Download" size="sm" variant="outline" />
          </div>
          <div className="s-flex s-items-center s-justify-between s-rounded-md s-border s-p-3">
            <span className="s-text-sm">report.docx</span>
            <Button label="Download" size="sm" variant="outline" />
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "settings",
    title: "Settings",
    description: "Configure your preferences",
    icon: CogIcon,
    content: (
      <div className="s-space-y-4">
        <div>
          <h3 className="s-mb-2 s-text-lg s-font-semibold">
            Application Settings
          </h3>
          <p className="s-text-sm s-text-muted-foreground">
            Customize your experience and notification preferences.
          </p>
        </div>
        <div className="s-space-y-3">
          <div className="s-flex s-items-center s-justify-between">
            <span className="s-text-sm">Email notifications</span>
            <input type="checkbox" className="s-rounded" defaultChecked />
          </div>
          <div className="s-flex s-items-center s-justify-between">
            <span className="s-text-sm">Dark mode</span>
            <input type="checkbox" className="s-rounded" />
          </div>
          <div className="s-flex s-items-center s-justify-between">
            <span className="s-text-sm">Auto-save</span>
            <input type="checkbox" className="s-rounded" defaultChecked />
          </div>
        </div>
      </div>
    ),
  },
];

const MultiPageSheetDemo = () => {
  const [currentPageId, setCurrentPageId] = useState("profile");

  const handleSave = () => {
    alert("Changes saved!");
  };

  return (
    <MultiPageSheet>
      <MultiPageSheetTrigger asChild>
        <Button label="Open Multi-Page Sheet" />
      </MultiPageSheetTrigger>
      <MultiPageSheetContent
        pages={samplePages}
        currentPageId={currentPageId}
        onPageChange={setCurrentPageId}
        size="lg"
        onSave={handleSave}
      />
    </MultiPageSheet>
  );
};

export const Default: Story = {
  render: () => <MultiPageSheetDemo />,
};

export const WithoutNavigation: Story = {
  render: () => {
    const [currentPageId, setCurrentPageId] = useState("profile");

    return (
      <MultiPageSheet>
        <MultiPageSheetTrigger asChild>
          <Button label="Open Without Navigation" />
        </MultiPageSheetTrigger>
        <MultiPageSheetContent
          pages={samplePages}
          currentPageId={currentPageId}
          onPageChange={setCurrentPageId}
          size="md"
          showNavigation={false}
        />
      </MultiPageSheet>
    );
  },
};

export const SinglePage: Story = {
  render: () => {
    const [currentPageId, setCurrentPageId] = useState("profile");
    const singlePage = [samplePages[0]];

    return (
      <MultiPageSheet>
        <MultiPageSheetTrigger asChild>
          <Button label="Open Single Page" />
        </MultiPageSheetTrigger>
        <MultiPageSheetContent
          pages={singlePage}
          currentPageId={currentPageId}
          onPageChange={setCurrentPageId}
          size="md"
        />
      </MultiPageSheet>
    );
  },
};

export const LeftSide: Story = {
  render: () => {
    const [currentPageId, setCurrentPageId] = useState("profile");

    return (
      <MultiPageSheet>
        <MultiPageSheetTrigger asChild>
          <Button label="Open from Left" />
        </MultiPageSheetTrigger>
        <MultiPageSheetContent
          pages={samplePages}
          currentPageId={currentPageId}
          onPageChange={setCurrentPageId}
          size="lg"
          side="left"
        />
      </MultiPageSheet>
    );
  },
};

export const WithFooterContent: Story = {
  render: () => {
    const [currentPageId, setCurrentPageId] = useState("profile");

    const handleSave = () => {
      alert("Changes saved!");
    };

    return (
      <MultiPageSheet>
        <MultiPageSheetTrigger asChild>
          <Button label="Open with Footer Content" />
        </MultiPageSheetTrigger>
        <MultiPageSheetContent
          pages={samplePages}
          currentPageId={currentPageId}
          onPageChange={setCurrentPageId}
          size="lg"
          onSave={handleSave}
          footerContent={<Button label="Export" variant="outline" size="sm" />}
        />
      </MultiPageSheet>
    );
  },
};
