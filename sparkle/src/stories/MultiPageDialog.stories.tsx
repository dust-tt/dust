import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import { Button } from "@sparkle/components/Button";
import {
  MultiPageDialog,
  MultiPageDialogContent,
  type MultiPageDialogPage,
  MultiPageDialogTrigger,
} from "@sparkle/components/MultiPageDialog";
import { Cog6ToothIcon, DocumentTextIcon, UserIcon } from "@sparkle/icons/app";

const meta: Meta<typeof MultiPageDialogContent> = {
  title: "Primitives/MultiPageDialog",
  component: MultiPageDialogContent,
};

export default meta;
type Story = StoryObj<typeof meta>;

const samplePages: MultiPageDialogPage[] = [
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
    icon: Cog6ToothIcon,
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

const MultiPageDialogDemo = () => {
  const [currentPageId, setCurrentPageId] = useState("profile");

  const handleSave = () => {
    alert("Changes saved!");
  };

  return (
    <MultiPageDialog>
      <MultiPageDialogTrigger asChild>
        <Button label="Open Multi-Page Dialog" />
      </MultiPageDialogTrigger>
      <MultiPageDialogContent
        pages={samplePages}
        currentPageId={currentPageId}
        onPageChange={setCurrentPageId}
        size="xl"
        onSave={handleSave}
      />
    </MultiPageDialog>
  );
};

export const Default: Story = {
  render: () => <MultiPageDialogDemo />,
};

export const InteractiveContent: Story = {
  render: () => {
    const [currentPageId, setCurrentPageId] = useState("step1");
    const [formData, setFormData] = useState({
      name: "",
      email: "",
      selectedFile: "",
      notifications: false,
    });

    const handleSave = () => {
      alert(`Setup completed! Data: ${JSON.stringify(formData, null, 2)}`);
    };

    const interactivePages: MultiPageDialogPage[] = [
      {
        id: "step1",
        title: "Personal Info",
        description: "Enter your basic information",
        icon: UserIcon,
        content: (
          <div className="s-space-y-4">
            <div>
              <h3 className="s-mb-2 s-text-lg s-font-semibold">
                Let's get started
              </h3>
              <p className="s-text-sm s-text-muted-foreground">
                Fill in your details to continue to the next step.
              </p>
            </div>
            <div className="s-space-y-3">
              <div>
                <label className="s-text-sm s-font-medium">Full Name *</label>
                <input
                  type="text"
                  className="s-mt-1 s-w-full s-rounded-md s-border s-px-3 s-py-2"
                  placeholder="Enter your name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="s-text-sm s-font-medium">Email *</label>
                <input
                  type="email"
                  className="s-mt-1 s-w-full s-rounded-md s-border s-px-3 s-py-2"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>
              <div className="s-pt-2">
                <Button
                  label="Continue to File Selection"
                  variant="primary"
                  size="md"
                  disabled={!formData.name || !formData.email}
                  onClick={() => setCurrentPageId("step2")}
                />
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "step2",
        title: "File Selection",
        description: "Choose your files",
        icon: DocumentTextIcon,
        content: (
          <div className="s-space-y-4">
            <div>
              <h3 className="s-mb-2 s-text-lg s-font-semibold">
                Select a file to work with
              </h3>
              <p className="s-text-sm s-text-muted-foreground">
                Choose from the available files below.
              </p>
            </div>
            <div className="s-space-y-2">
              {[
                "project-proposal.pdf",
                "budget-2024.xlsx",
                "meeting-notes.docx",
              ].map((file) => (
                <div
                  key={file}
                  className={`s-flex s-cursor-pointer s-items-center s-justify-between s-rounded-md s-border s-p-3 s-transition-colors hover:s-bg-gray-50 ${
                    formData.selectedFile === file
                      ? "s-border-blue-300 s-bg-blue-50"
                      : ""
                  }`}
                  onClick={() =>
                    setFormData({ ...formData, selectedFile: file })
                  }
                >
                  <span className="s-text-sm">{file}</span>
                  <div className="s-flex s-items-center s-gap-2">
                    <input
                      type="radio"
                      checked={formData.selectedFile === file}
                      readOnly
                      className="s-pointer-events-none"
                    />
                  </div>
                </div>
              ))}
            </div>
            {formData.selectedFile && (
              <div className="s-pt-2">
                <Button
                  label="Continue to Settings"
                  variant="primary"
                  size="md"
                  onClick={() => setCurrentPageId("step3")}
                />
              </div>
            )}
          </div>
        ),
      },
      {
        id: "step3",
        title: "Final Settings",
        description: "Configure your preferences",
        icon: Cog6ToothIcon,
        content: (
          <div className="s-space-y-4">
            <div>
              <h3 className="s-mb-2 s-text-lg s-font-semibold">Almost done!</h3>
              <p className="s-text-sm s-text-muted-foreground">
                Configure your final preferences and complete the setup.
              </p>
            </div>
            <div className="s-space-y-3">
              <div className="s-flex s-items-center s-justify-between">
                <span className="s-text-sm">Enable email notifications</span>
                <input
                  type="checkbox"
                  className="s-rounded"
                  checked={formData.notifications}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      notifications: e.target.checked,
                    })
                  }
                />
              </div>
              <div className="s-rounded-md s-bg-gray-50 s-p-3">
                <h4 className="s-mb-2 s-text-sm s-font-medium">Summary</h4>
                <div className="s-space-y-1 s-text-xs s-text-gray-600">
                  <div>Name: {formData.name}</div>
                  <div>Email: {formData.email}</div>
                  <div>Selected File: {formData.selectedFile}</div>
                  <div>
                    Notifications:{" "}
                    {formData.notifications ? "Enabled" : "Disabled"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ),
      },
    ];

    return (
      <MultiPageDialog>
        <MultiPageDialogTrigger asChild>
          <Button label="Open Interactive Setup" />
        </MultiPageDialogTrigger>
        <MultiPageDialogContent
          pages={interactivePages}
          currentPageId={currentPageId}
          onPageChange={setCurrentPageId}
          size="lg"
          onSave={handleSave}
        />
      </MultiPageDialog>
    );
  },
};

export const WithConditionalNavigation: Story = {
  render: () => {
    const [currentPageId, setCurrentPageId] = useState("data-selection");
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [description, setDescription] = useState("");

    const handleSave = () => {
      alert(
        `Configuration saved! Selected: ${selectedItems.join(", ")}, Description: ${description}`
      );
    };

    const conditionalPages: MultiPageDialogPage[] = [
      {
        id: "data-selection",
        title: "Select Data Sources",
        description: "Choose which data sources to include",
        icon: DocumentTextIcon,
        content: (
          <div className="s-space-y-4">
            <div>
              <h3 className="s-mb-2 s-text-lg s-font-semibold">
                Available Data Sources
              </h3>
              <p className="s-text-sm s-text-muted-foreground">
                Select at least one data source to proceed to the next step.
              </p>
            </div>
            <div className="s-space-y-2">
              {[
                "Company Database",
                "Customer Files",
                "Analytics Data",
                "Reports Archive",
              ].map((item) => (
                <div
                  key={item}
                  className={`s-flex s-cursor-pointer s-items-center s-justify-between s-rounded-md s-border s-p-3 s-transition-colors hover:s-bg-gray-50 ${
                    selectedItems.includes(item)
                      ? "s-border-blue-300 s-bg-blue-50"
                      : ""
                  }`}
                  onClick={() => {
                    if (selectedItems.includes(item)) {
                      setSelectedItems(selectedItems.filter((i) => i !== item));
                    } else {
                      setSelectedItems([...selectedItems, item]);
                    }
                  }}
                >
                  <span className="s-text-sm">{item}</span>
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(item)}
                    readOnly
                    className="s-pointer-events-none"
                  />
                </div>
              ))}
            </div>
            {selectedItems.length > 0 && (
              <div className="s-rounded-md s-border s-bg-blue-50 s-p-3">
                <p className="s-text-sm s-text-blue-700">
                  {selectedItems.length} data source
                  {selectedItems.length !== 1 ? "s" : ""} selected
                </p>
              </div>
            )}
          </div>
        ),
      },
      {
        id: "description",
        title: "Add Description",
        description: "Describe your configuration",
        icon: Cog6ToothIcon,
        content: (
          <div className="s-space-y-4">
            <div>
              <h3 className="s-mb-2 s-text-lg s-font-semibold">
                Configuration Details
              </h3>
              <p className="s-text-sm s-text-muted-foreground">
                Add a description for your selected data sources.
              </p>
            </div>
            <div className="s-rounded-md s-border s-bg-blue-50 s-p-3">
              <p className="s-text-sm s-text-blue-700">
                Selected: {selectedItems.join(", ")}
              </p>
            </div>
            <div className="s-space-y-2">
              <label className="s-text-sm s-font-medium">Description</label>
              <textarea
                className="s-mt-1 s-w-full s-rounded-md s-border s-px-3 s-py-2"
                placeholder="Describe how these data sources will be used..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
              <p className="s-text-xs s-text-muted-foreground">
                This description helps explain the purpose of your
                configuration.
              </p>
            </div>
          </div>
        ),
      },
    ];

    return (
      <MultiPageDialog>
        <MultiPageDialogTrigger asChild>
          <Button label="Open Configuration Wizard" />
        </MultiPageDialogTrigger>
        <MultiPageDialogContent
          pages={conditionalPages}
          currentPageId={currentPageId}
          onPageChange={setCurrentPageId}
          size="lg"
          onSave={handleSave}
          showNavigation={true}
          disableNext={
            currentPageId === "data-selection" && selectedItems.length === 0
          }
          disableSave={!description.trim()}
          footerContent={
            <div className="s-w-full s-border s-border-border-dark">
              This is a footer content
            </div>
          }
        />
      </MultiPageDialog>
    );
  },
};

export const ScrollableContent: Story = {
  render: () => {
    const [currentPageId, setCurrentPageId] = useState("long-form");

    const handleSave = () => {
      alert("Long form submitted!");
    };

    const scrollablePages: MultiPageDialogPage[] = [
      {
        id: "long-form",
        title: "Long Form Content",
        description: "This page demonstrates scrollable content",
        icon: DocumentTextIcon,
        content: (
          <div className="s-space-y-6">
            <div>
              <h3 className="s-mb-2 s-text-lg s-font-semibold">
                Terms and Conditions
              </h3>
              <p className="s-text-sm s-text-muted-foreground">
                This page contains a lot of content to demonstrate scrolling
                functionality. The content should be scrollable within the
                dialog area.
              </p>
            </div>

            {Array.from({ length: 15 }, (_, i) => (
              <div key={i} className="s-space-y-3">
                <h4 className="s-text-md s-font-semibold">Section {i + 1}</h4>
                <p className="s-text-sm s-text-muted-foreground">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed
                  do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                  Ut enim ad minim veniam, quis nostrud exercitation ullamco
                  laboris nisi ut aliquip ex ea commodo consequat. Duis aute
                  irure dolor in reprehenderit in voluptate velit esse cillum
                  dolore eu fugiat nulla pariatur.
                </p>
                <div className="s-space-y-2">
                  <div>
                    <label className="s-text-sm s-font-medium">
                      Field {i + 1}
                    </label>
                    <input
                      type="text"
                      className="s-mt-1 s-w-full s-rounded-md s-border s-px-3 s-py-2"
                      placeholder={`Enter value for field ${i + 1}`}
                    />
                  </div>
                  {i % 3 === 0 && (
                    <div>
                      <label className="s-text-sm s-font-medium">
                        Additional Notes
                      </label>
                      <textarea
                        className="s-mt-1 s-w-full s-rounded-md s-border s-px-3 s-py-2"
                        placeholder="Add any additional notes here..."
                        rows={3}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div className="s-rounded-md s-border s-bg-blue-50 s-p-4">
              <h4 className="s-mb-2 s-text-sm s-font-semibold s-text-blue-900">
                Scroll Test Complete
              </h4>
              <p className="s-text-xs s-text-blue-700">
                If you can see this message, the scrolling functionality is
                working correctly! The dialog maintains its fixed height while
                allowing the content to scroll.
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "summary",
        title: "Summary",
        description: "Review your information",
        icon: Cog6ToothIcon,
        content: (
          <div className="s-space-y-4">
            <div>
              <h3 className="s-mb-2 s-text-lg s-font-semibold">Form Summary</h3>
              <p className="s-text-sm s-text-muted-foreground">
                Thank you for testing the scrollable content functionality.
              </p>
            </div>
            <div className="s-rounded-md s-border s-bg-green-50 s-p-3">
              <p className="s-text-sm s-text-green-700">
                ✓ Scrolling functionality verified
              </p>
              <p className="s-text-sm s-text-green-700">
                ✓ Fixed dialog height maintained
              </p>
              <p className="s-text-sm s-text-green-700">
                ✓ Content overflow handled properly
              </p>
            </div>
          </div>
        ),
      },
    ];

    return (
      <MultiPageDialog>
        <MultiPageDialogTrigger asChild>
          <Button label="Open Scrollable Content Dialog" />
        </MultiPageDialogTrigger>
        <MultiPageDialogContent
          pages={scrollablePages}
          currentPageId={currentPageId}
          onPageChange={setCurrentPageId}
          size="lg"
          onSave={handleSave}
        />
      </MultiPageDialog>
    );
  },
};
