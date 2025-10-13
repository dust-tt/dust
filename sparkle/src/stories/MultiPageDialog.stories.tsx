import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import { SearchInput } from "@sparkle/components";
import { Button } from "@sparkle/components/Button";
import { Checkbox } from "@sparkle/components/Checkbox";
import { CollapsibleComponent } from "@sparkle/components/Collapsible";
import {
  MultiPageDialog,
  MultiPageDialogContent,
  type MultiPageDialogPage,
  MultiPageDialogTrigger,
} from "@sparkle/components/MultiPageDialog";
import {
  Cog6ToothIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
  UserIcon,
} from "@sparkle/icons/app";
import { GmailLogo } from "@sparkle/logo/platforms";

const meta: Meta<typeof MultiPageDialogContent> = {
  title: "Modules/MultiPageDialog",
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
  const [isOpen, setIsOpen] = useState(false);

  const handleSave = () => {
    alert("Changes saved!");
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  return (
    <MultiPageDialog open={isOpen} onOpenChange={setIsOpen}>
      <MultiPageDialogTrigger asChild>
        <Button label="Open Multi-Page Dialog" />
      </MultiPageDialogTrigger>
      <MultiPageDialogContent
        pages={samplePages}
        currentPageId={currentPageId}
        onPageChange={setCurrentPageId}
        size="xl"
        leftButton={{
          label: "Cancel",
          variant: "outline",
          onClick: handleCancel,
        }}
        rightButton={{
          label: "Save Changes",
          variant: "primary",
          onClick: handleSave,
        }}
      />
    </MultiPageDialog>
  );
};

export const Default: Story = {
  render: () => <MultiPageDialogDemo />,
};

// Simple two-button example (like your screenshot)
export const SimpleToolDialog: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedTools, setSelectedTools] = useState<string[]>([]);

    const handleAddTools = () => {
      alert(
        `Adding ${selectedTools.length} tools: ${selectedTools.join(", ")}`
      );
      setIsOpen(false);
    };

    const handleCancel = () => {
      setSelectedTools([]);
      setIsOpen(false);
    };

    const toggleTool = (tool: string) => {
      setSelectedTools((prev) =>
        prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
      );
    };

    const toolPages: MultiPageDialogPage[] = [
      {
        id: "tool-selection",
        title: "Add tools",
        content: (
          <div className="s-space-y-6">
            <div className="s-space-y-4">
              <h3 className="s-text-lg s-font-semibold">Capabilities</h3>
              <div className="s-grid s-grid-cols-2 s-gap-3">
                {[
                  {
                    name: "Image generation",
                    desc: "Generate images using natural language",
                  },
                  {
                    name: "Run agent",
                    desc: "Run a child agent (agent as tool)",
                  },
                  {
                    name: "Interactive content",
                    desc: "Generate interactive content",
                  },
                  {
                    name: "Agent memory",
                    desc: "Store and recall information",
                  },
                ].map((tool) => (
                  <div
                    key={tool.name}
                    className={`s-cursor-pointer s-rounded-lg s-border s-p-4 s-transition-colors hover:s-bg-gray-50 ${
                      selectedTools.includes(tool.name)
                        ? "s-border-blue-300 s-bg-blue-50"
                        : "s-border-gray-200"
                    }`}
                    onClick={() => toggleTool(tool.name)}
                  >
                    <div className="s-flex s-items-start s-justify-between">
                      <div>
                        <h4 className="s-font-medium">{tool.name}</h4>
                        <p className="s-text-sm s-text-gray-600">{tool.desc}</p>
                      </div>
                      {selectedTools.includes(tool.name) && (
                        <span className="s-rounded s-bg-green-100 s-px-2 s-py-1 s-text-xs s-text-green-700">
                          ADDED
                        </span>
                      )}
                    </div>
                    {!selectedTools.includes(tool.name) && (
                      <button className="s-mt-2 s-text-sm s-text-blue-600 hover:s-text-blue-700">
                        + Add
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {selectedTools.length > 0 && (
              <div className="s-space-y-3">
                <h4 className="s-font-medium">Added tools</h4>
                <div className="s-flex s-flex-wrap s-gap-2">
                  {selectedTools.map((tool) => (
                    <span
                      key={tool}
                      className="s-flex s-items-center s-gap-1 s-rounded s-bg-gray-100 s-px-3 s-py-1 s-text-sm"
                    >
                      {tool}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTool(tool);
                        }}
                        className="s-ml-1 s-text-gray-500 hover:s-text-gray-700"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ),
      },
    ];

    return (
      <MultiPageDialog open={isOpen} onOpenChange={setIsOpen}>
        <MultiPageDialogTrigger asChild>
          <Button label="Add tools" />
        </MultiPageDialogTrigger>
        <MultiPageDialogContent
          pages={toolPages}
          showHeaderNavigation={false}
          currentPageId="tool-selection"
          onPageChange={() => {}}
          size="xl"
          height="xl"
          leftButton={{
            label: "Cancel",
            variant: "outline",
            onClick: handleCancel,
          }}
          rightButton={{
            label:
              selectedTools.length > 0
                ? `Add ${selectedTools.length} tool${selectedTools.length > 1 ? "s" : ""}`
                : "Add tools",
            variant: "primary",
            disabled: selectedTools.length === 0,
            onClick: handleAddTools,
          }}
        />
      </MultiPageDialog>
    );
  },
};

export const InteractiveContent: Story = {
  render: () => {
    const [currentPageId, setCurrentPageId] = useState("step1");
    const [isOpen, setIsOpen] = useState(false);
    const [formData, setFormData] = useState({
      name: "",
      email: "",
      selectedFile: "",
      notifications: false,
    });

    const handleSave = () => {
      alert(`Setup completed! Data: ${JSON.stringify(formData, null, 2)}`);
      setIsOpen(false);
    };

    const handleCancel = () => {
      setIsOpen(false);
    };

    const handleNext = () => {
      if (currentPageId === "step1") {
        setCurrentPageId("step2");
      } else if (currentPageId === "step2") {
        setCurrentPageId("step3");
      }
    };

    const handlePrevious = () => {
      if (currentPageId === "step3") {
        setCurrentPageId("step2");
      } else if (currentPageId === "step2") {
        setCurrentPageId("step1");
      }
    };

    const canProceed = () => {
      if (currentPageId === "step1") {
        return formData.name && formData.email;
      }
      if (currentPageId === "step2") {
        return formData.selectedFile;
      }
      return true;
    };

    const isFirstPage = currentPageId === "step1";
    const isLastPage = currentPageId === "step3";

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
      <MultiPageDialog open={isOpen} onOpenChange={setIsOpen}>
        <MultiPageDialogTrigger asChild>
          <Button label="Open Interactive Setup" />
        </MultiPageDialogTrigger>
        <MultiPageDialogContent
          pages={interactivePages}
          currentPageId={currentPageId}
          onPageChange={setCurrentPageId}
          size="lg"
          leftButton={{
            label: "Cancel",
            variant: "outline",
            onClick: handleCancel,
          }}
          centerButton={
            !isFirstPage
              ? {
                  label: "Previous",
                  variant: "outline",
                  onClick: handlePrevious,
                }
              : undefined
          }
          rightButton={{
            label: isLastPage ? "Complete Setup" : "Next",
            variant: "primary",
            disabled: !canProceed(),
            onClick: isLastPage ? handleSave : handleNext,
          }}
        />
      </MultiPageDialog>
    );
  },
};

export const WithConditionalNavigation: Story = {
  render: () => {
    const [currentPageId, setCurrentPageId] = useState("data-selection");
    const [isOpen, setIsOpen] = useState(false);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [description, setDescription] = useState("");

    const handleSave = () => {
      alert(
        `Configuration saved! Selected: ${selectedItems.join(", ")}, Description: ${description}`
      );
      setIsOpen(false);
    };

    const handleCancel = () => {
      setIsOpen(false);
    };

    const handleNext = () => {
      if (currentPageId === "data-selection") {
        setCurrentPageId("description");
      }
    };

    const handlePrevious = () => {
      if (currentPageId === "description") {
        setCurrentPageId("data-selection");
      }
    };

    const isFirstPage = currentPageId === "data-selection";
    const isLastPage = currentPageId === "description";
    const canProceedFromFirst = selectedItems.length > 0;
    const canSave = description.trim().length > 0;

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
      <MultiPageDialog open={isOpen} onOpenChange={setIsOpen}>
        <MultiPageDialogTrigger asChild>
          <Button label="Open Configuration Wizard" />
        </MultiPageDialogTrigger>
        <MultiPageDialogContent
          pages={conditionalPages}
          currentPageId={currentPageId}
          onPageChange={setCurrentPageId}
          size="lg"
          height="md"
          leftButton={{
            label: "Cancel",
            variant: "outline",
            onClick: handleCancel,
          }}
          centerButton={
            !isFirstPage
              ? {
                  label: "Previous",
                  variant: "outline",
                  onClick: handlePrevious,
                }
              : undefined
          }
          rightButton={{
            label: isLastPage ? "Save Configuration" : "Next",
            variant: "primary",
            disabled: isFirstPage ? !canProceedFromFirst : !canSave,
            onClick: isLastPage ? handleSave : handleNext,
          }}
          addFooterSeparator
          footerContent={
            <div className="s-rounded s-bg-blue-50">
              <p className="s-text-xs s-text-blue-700">
                {selectedItems.length > 0 && (
                  <>
                    {selectedItems.length} data source
                    {selectedItems.length !== 1 ? "s" : ""} selected •{" "}
                  </>
                )}
                Step {isFirstPage ? "1" : "2"} of 2
              </p>
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
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    const handleSave = () => {
      alert("Long form submitted!");
      setIsOpen(false);
    };

    const handleCancel = () => {
      setIsOpen(false);
    };

    const handleNext = () => {
      if (currentPageId === "long-form") {
        setCurrentPageId("summary");
      }
    };

    const handlePrevious = () => {
      if (currentPageId === "summary") {
        setCurrentPageId("long-form");
      }
    };

    const isFirstPage = currentPageId === "long-form";
    const isLastPage = currentPageId === "summary";

    const scrollablePages: MultiPageDialogPage[] = [
      {
        id: "long-form",
        title: "Long Form Content",
        description:
          "This page demonstrates scrollable content with fixed search",
        icon: DocumentTextIcon,
        fixedContent: (
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            name="search-content"
            placeholder="Search through content..."
          />
        ),
        content: (
          <div className="s-space-y-6">
            <div>
              <h3 className="s-mb-2 s-text-lg s-font-semibold">
                Terms and Conditions
              </h3>
              <p className="s-text-sm s-text-muted-foreground">
                This page contains a lot of content to demonstrate scrolling
                functionality with a fixed search input. The search input stays
                visible while scrolling through the content below.
              </p>
              {searchTerm && (
                <div className="s-rounded-md s-border s-bg-yellow-50 s-p-3">
                  <p className="s-text-sm s-text-yellow-800">
                    🔍 Searching for: <strong>{searchTerm}</strong>
                  </p>
                </div>
              )}
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
                Fixed Content Test Complete
              </h4>
              <p className="s-text-xs s-text-blue-700">
                If you can see this message, the fixed content functionality is
                working correctly! The search input remains fixed at the top
                while this content scrolls. Try scrolling back up - the search
                input should always be visible.
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "summary",
        title: "Summary",
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
      <MultiPageDialog open={isOpen} onOpenChange={setIsOpen}>
        <MultiPageDialogTrigger asChild>
          <Button label="Open Fixed Content Test Dialog" />
        </MultiPageDialogTrigger>
        <MultiPageDialogContent
          pages={scrollablePages}
          currentPageId={currentPageId}
          onPageChange={setCurrentPageId}
          size="xl"
          height="xl"
          leftButton={{
            label: "Cancel",
            variant: "outline",
            onClick: handleCancel,
          }}
          centerButton={
            !isFirstPage
              ? {
                  label: "Previous",
                  variant: "outline",
                  onClick: handlePrevious,
                }
              : undefined
          }
          rightButton={{
            label: isLastPage ? "Submit Form" : "Next",
            variant: "primary",
            onClick: isLastPage ? handleSave : handleNext,
          }}
        />
      </MultiPageDialog>
    );
  },
};

export const ActionValidation: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    const [currentPageId, setCurrentPageId] = useState("0");
    const [neverAskAgain, setNeverAskAgain] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isValidating, setIsValidating] = useState(false);

    const validationPages = [
      {
        id: "0",
        title: "Tool Validation Required",
        icon: GmailLogo,
        content: (
          <div className="s-space-y-6 s-pt-4">
            <div>
              <p className="s-mb-6 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                Allow{" "}
                <span className="s-font-semibold">@Marketing Assistant</span> to
                use the tool <span className="s-font-semibold">Send Email</span>{" "}
                from <span className="s-font-semibold">Gmail</span>?
              </p>

              <div className="s-space-y-3">
                <CollapsibleComponent
                  triggerChildren={
                    <span className="s-text-sm s-font-medium s-text-muted-foreground dark:s-text-muted-foreground-night">
                      Details
                    </span>
                  }
                  contentChildren={
                    <div className="s-mt-2 s-rounded-md s-border s-bg-muted s-p-3">
                      <h4 className="s-mb-2 s-text-sm s-font-medium">
                        Email Details
                      </h4>
                      <div className="s-space-y-2 s-text-sm">
                        <div>
                          <span className="s-font-medium">To:</span>{" "}
                          john.doe@example.com
                        </div>
                        <div>
                          <span className="s-font-medium">Subject:</span>{" "}
                          Welcome to our platform!
                        </div>
                        <div>
                          <span className="s-font-medium">Content:</span> Thank
                          you for signing up...
                        </div>
                      </div>
                    </div>
                  }
                />

                {errorMessage && (
                  <div className="s-flex s-items-center s-gap-2 s-text-sm s-font-medium s-text-warning-800">
                    <ExclamationCircleIcon className="s-h-4 s-w-4" />
                    {errorMessage}
                  </div>
                )}

                <div className="s-mt-4">
                  <label className="s-copy-xs s-flex s-w-fit s-cursor-pointer s-flex-row s-items-center s-gap-2 s-py-2 s-pr-2 s-font-normal">
                    <Checkbox
                      size="xs"
                      checked={neverAskAgain}
                      onCheckedChange={(check) => {
                        setNeverAskAgain(!!check);
                      }}
                    />
                    <span>Always allow this tool</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "1",
        title: "Bulk Email Validation",
        icon: GmailLogo,
        content: (
          <div className="s-space-y-6 s-pt-4">
            <div>
              <p className="s-mb-6 s-text-sm s-text-muted-foreground">
                Allow{" "}
                <span className="s-font-semibold">@Marketing Assistant</span> to
                use the tool{" "}
                <span className="s-font-semibold">Send Bulk Email</span> from{" "}
                <span className="s-font-semibold">Gmail</span>?
              </p>

              <div className="s-space-y-3">
                <CollapsibleComponent
                  triggerChildren={
                    <span className="s-text-sm s-font-medium s-text-muted-foreground dark:s-text-muted-foreground-night">
                      Details
                    </span>
                  }
                  contentChildren={
                    <div className="s-mt-2 s-rounded-md s-border s-bg-muted s-p-3">
                      <h4 className="s-mb-2 s-text-sm s-font-medium">
                        Campaign Details
                      </h4>
                      <div className="s-space-y-2 s-text-sm">
                        <div>
                          <span className="s-font-medium">Recipients:</span>{" "}
                          1,250 subscribers
                        </div>
                        <div>
                          <span className="s-font-medium">Subject:</span>{" "}
                          Monthly Newsletter - March 2024
                        </div>
                        <div>
                          <span className="s-font-medium">Template:</span>{" "}
                          Newsletter Template v2
                        </div>
                      </div>
                    </div>
                  }
                />

                <div className="s-rounded-md s-border s-bg-blue-50 s-p-3">
                  <h4 className="s-mb-1 s-text-sm s-font-medium s-text-blue-900">
                    Security Notice
                  </h4>
                  <p className="s-text-xs s-text-blue-700">
                    This action will send emails to a large number of
                    recipients. Please review the content carefully.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "2",
        title: "Email Template Validation",
        icon: GmailLogo,
        content: (
          <div className="s-space-y-6 s-pt-4">
            <div>
              <p className="s-mb-6 s-text-sm s-text-muted-foreground">
                Allow{" "}
                <span className="s-font-semibold">@Marketing Assistant</span> to
                use the tool{" "}
                <span className="s-font-semibold">Create Email Template</span>{" "}
                from <span className="s-font-semibold">Gmail</span>?
              </p>

              <div className="s-space-y-3">
                <CollapsibleComponent
                  triggerChildren={
                    <span className="s-text-sm s-font-medium s-text-muted-foreground dark:s-text-muted-foreground-night">
                      Details
                    </span>
                  }
                  contentChildren={
                    <div className="s-mt-2 s-rounded-md s-border s-bg-muted s-p-3">
                      <h4 className="s-mb-2 s-text-sm s-font-medium">
                        Template Details
                      </h4>
                      <div className="s-space-y-2 s-text-sm">
                        <div>
                          <span className="s-font-medium">Name:</span> Welcome
                          Series - Day 1
                        </div>
                        <div>
                          <span className="s-font-medium">Category:</span>{" "}
                          Onboarding
                        </div>
                        <div>
                          <span className="s-font-medium">Variables:</span>{" "}
                          {"{{name}}"}, {"{{company}}"}, {"{{trial_end_date}}"}
                        </div>
                      </div>
                    </div>
                  }
                />

                <div className="s-rounded-md s-border s-bg-green-50 s-p-3">
                  <h4 className="s-mb-1 s-text-sm s-font-medium s-text-green-900">
                    Low Risk Action
                  </h4>
                  <p className="s-text-xs s-text-green-700">
                    This action only creates a template and does not send any
                    emails.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ),
      },
    ];

    const isLastPage =
      currentPageId === (validationPages.length - 1).toString();

    const handleApprove = async () => {
      setIsValidating(true);
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setIsValidating(false);
      if (isLastPage) {
        setIsOpen(false);
      } else {
        // Move to next page
        const nextPageIndex = parseInt(currentPageId) + 1;
        setCurrentPageId(nextPageIndex.toString());
      }
    };

    const handleDecline = async () => {
      setIsValidating(true);
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      setIsValidating(false);
      setErrorMessage("Action was declined by user");
      if (isLastPage) {
        setIsOpen(false);
      }
    };

    return (
      <MultiPageDialog open={isOpen} onOpenChange={setIsOpen}>
        <MultiPageDialogTrigger asChild>
          <Button label="Open Email Validation Dialog" />
        </MultiPageDialogTrigger>
        <MultiPageDialogContent
          pages={validationPages}
          currentPageId={currentPageId}
          onPageChange={setCurrentPageId}
          size="md"
          isAlertDialog
          showNavigation={true}
          showHeaderNavigation={false}
          hideCloseButton={true}
          footerContent={
            <div className="s-flex s-flex-row s-justify-end s-gap-2">
              <Button
                variant="outline"
                label={"Decline"}
                onClick={handleDecline}
                disabled={isValidating}
                isLoading={isValidating}
              />
              <Button
                variant="highlight"
                label={"Allow"}
                autoFocus
                onClick={handleApprove}
                disabled={isValidating}
                isLoading={isValidating}
              />
            </div>
          }
        />
      </MultiPageDialog>
    );
  },
};
