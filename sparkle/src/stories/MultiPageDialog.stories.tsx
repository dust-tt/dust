import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import { SearchInput } from "@sparkle/components";
import { Button } from "@sparkle/components/Button";
import { Checkbox } from "@sparkle/components/Checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@sparkle/components/Collapsible";
import {
  MultiPageDialog,
  MultiPageDialogContent,
  type MultiPageDialogPage,
  MultiPageDialogTrigger,
} from "@sparkle/components/MultiPageDialog";

import { GmailLogo } from "@sparkle/logo/platforms";
import {
  AlertCircle,
  File04,
  Settings01,
  User01,
} from "@sparkle/icons/v2-stroke";

const meta: Meta<typeof MultiPageDialogContent> = {
  title: "Overlays/MultiPageDialog",
  component: MultiPageDialogContent,
  parameters: {
    docs: {
      description: {
        component: `A modal dialog that hosts multiple **pages** in a single overlay, ideal for wizards and multi-step flows. Composed from **MultiPageDialogTrigger** and **MultiPageDialogContent**, it takes an array of \`pages\` (each with \`id\`, \`title\`, optional \`description\` / \`icon\`, \`content\`, and optional \`fixedContent\`) plus the current \`currentPageId\` and \`onPageChange\`. It supports \`size\` / \`height\`, configurable footer \`leftButton\` / \`centerButton\` / \`rightButton\`, custom \`footerContent\`, an \`isAlertDialog\` mode, and toggles for header and inline navigation.

**When to use**
- For multi-step wizards, setup flows, or tool/action validation prompts shown as a centered modal.
- When the flow demands the user's focus and should block interaction with the page behind it.

**Guidelines**
- Drive paging yourself: control \`currentPageId\` and update it from the footer buttons' \`onClick\`.
- Use \`isAlertDialog\` with \`hideCloseButton\` for confirmations that require an explicit choice.
- For a side-anchored multi-step panel that keeps page context visible, use **MultiPageSheet** instead.`,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const samplePages: MultiPageDialogPage[] = [
  {
    id: "profile",
    title: "User Profile",
    description: "Manage your personal information",
    icon: User01,
    content: (
      <div className="space-y-4">
        <div>
          <h3 className="mb-2 text-lg font-semibold">Personal Information</h3>
          <p className="text-sm text-muted-foreground">
            Update your profile details and preferences.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Full Name</label>
            <input
              type="text"
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              className="mt-1 w-full rounded-md border px-3 py-2"
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
    icon: File04,
    content: (
      <div className="space-y-4">
        <div>
          <h3 className="mb-2 text-lg font-semibold">File Management</h3>
          <p className="text-sm text-muted-foreground">
            Upload, organize, and manage your documents.
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-md border p-3">
            <span className="text-sm">document1.pdf</span>
            <Button label="Download" size="sm" variant="outline" />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <span className="text-sm">report.docx</span>
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
    icon: Settings01,
    content: (
      <div className="space-y-4">
        <div>
          <h3 className="mb-2 text-lg font-semibold">Application Settings</h3>
          <p className="text-sm text-muted-foreground">
            Customize your experience and notification preferences.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Email notifications</span>
            <input type="checkbox" className="rounded" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Dark mode</span>
            <input type="checkbox" className="rounded" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Auto-save</span>
            <input type="checkbox" className="rounded" defaultChecked />
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

/**
 * Baseline setup: three static pages (profile / documents / settings) with the
 * built-in header navigation, a Cancel `leftButton`, and a Save `rightButton`.
 * The parent controls `currentPageId` and `open` state.
 * @summary Basic three-page dialog with footer buttons.
 */
export const Default: Story = {
  render: () => <MultiPageDialogDemo />,
};

/**
 * A single-page dialog used as a picker: header navigation is hidden
 * (`showHeaderNavigation={false}`) and the primary button's label and disabled
 * state react to the current selection.
 * @summary Single-page tool picker with selection-aware confirm button.
 */
export const SimpleToolDialog: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedTools, setSelectedTools] = useState<string[]>([]);

    const handleAddTools = () => {
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
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Capabilities</h3>
              <div className="grid grid-cols-2 gap-3">
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
                    className={`cursor-pointer rounded-lg border p-4 transition-colors hover:bg-gray-50 ${
                      selectedTools.includes(tool.name)
                        ? "border-blue-300 bg-blue-50"
                        : "border-gray-200"
                    }`}
                    onClick={() => toggleTool(tool.name)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium">{tool.name}</h4>
                        <p className="text-sm text-gray-600">{tool.desc}</p>
                      </div>
                      {selectedTools.includes(tool.name) && (
                        <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-700">
                          ADDED
                        </span>
                      )}
                    </div>
                    {!selectedTools.includes(tool.name) && (
                      <button className="mt-2 text-sm text-blue-600 hover:text-blue-700">
                        + Add
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {selectedTools.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium">Added tools</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedTools.map((tool) => (
                    <span
                      key={tool}
                      className="flex items-center gap-1 rounded bg-gray-100 px-3 py-1 text-sm"
                    >
                      {tool}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTool(tool);
                        }}
                        className="ml-1 text-gray-500 hover:text-gray-700"
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

/**
 * A three-step wizard where form state gates progression: unlike `Default`'s
 * static pages, each page writes into shared `formData` and the Next button is
 * disabled until the current step is valid. The footer swaps between
 * Previous / Next / Complete depending on the step.
 * @summary Wizard with per-page form state and gated Next button.
 */
export const WizardWithFormState: Story = {
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
        icon: User01,
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-lg font-semibold">Let's get started</h3>
              <p className="text-sm text-muted-foreground">
                Fill in your details to continue to the next step.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Full Name *</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  placeholder="Enter your name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Email *</label>
                <input
                  type="email"
                  className="mt-1 w-full rounded-md border px-3 py-2"
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
        icon: File04,
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-lg font-semibold">
                Select a file to work with
              </h3>
              <p className="text-sm text-muted-foreground">
                Choose from the available files below.
              </p>
            </div>
            <div className="space-y-2">
              {[
                "project-proposal.pdf",
                "budget-2024.xlsx",
                "meeting-notes.docx",
              ].map((file) => (
                <div
                  key={file}
                  className={`flex cursor-pointer items-center justify-between rounded-md border p-3 transition-colors hover:bg-gray-50 ${
                    formData.selectedFile === file
                      ? "border-blue-300 bg-blue-50"
                      : ""
                  }`}
                  onClick={() =>
                    setFormData({ ...formData, selectedFile: file })
                  }
                >
                  <span className="text-sm">{file}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={formData.selectedFile === file}
                      readOnly
                      className="pointer-events-none"
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
        icon: Settings01,
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-lg font-semibold">Almost done!</h3>
              <p className="text-sm text-muted-foreground">
                Configure your final preferences and complete the setup.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Enable email notifications</span>
                <input
                  type="checkbox"
                  className="rounded"
                  checked={formData.notifications}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      notifications: e.target.checked,
                    })
                  }
                />
              </div>
              <div className="rounded-md bg-gray-50 p-3">
                <h4 className="mb-2 text-sm font-medium">Summary</h4>
                <div className="space-y-1 text-xs text-gray-600">
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

/**
 * Two-step configuration flow with per-step validation rules (a selection is
 * required on step 1, a description on step 2) and custom `footerContent`
 * showing live progress next to the buttons, separated by
 * `addFooterSeparator`.
 * @summary Conditional navigation with custom footer content.
 */
export const WithConditionalNavigation: Story = {
  render: () => {
    const [currentPageId, setCurrentPageId] = useState("data-selection");
    const [isOpen, setIsOpen] = useState(false);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [description, setDescription] = useState("");

    const handleSave = () => {
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
        icon: File04,
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-lg font-semibold">
                Available Data Sources
              </h3>
              <p className="text-sm text-muted-foreground">
                Select at least one data source to proceed to the next step.
              </p>
            </div>
            <div className="space-y-2">
              {[
                "Company Database",
                "Customer Files",
                "Analytics Data",
                "Reports Archive",
              ].map((item) => (
                <div
                  key={item}
                  className={`flex cursor-pointer items-center justify-between rounded-md border p-3 transition-colors hover:bg-gray-50 ${
                    selectedItems.includes(item)
                      ? "border-blue-300 bg-blue-50"
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
                  <span className="text-sm">{item}</span>
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(item)}
                    readOnly
                    className="pointer-events-none"
                  />
                </div>
              ))}
            </div>
            {selectedItems.length > 0 && (
              <div className="rounded-md border bg-blue-50 p-3">
                <p className="text-sm text-blue-700">
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
        icon: Settings01,
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-lg font-semibold">
                Configuration Details
              </h3>
              <p className="text-sm text-muted-foreground">
                Add a description for your selected data sources.
              </p>
            </div>
            <div className="rounded-md border bg-blue-50 p-3">
              <p className="text-sm text-blue-700">
                Selected: {selectedItems.join(", ")}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <textarea
                className="mt-1 w-full rounded-md border px-3 py-2"
                placeholder="Describe how these data sources will be used..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
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
            <div className="rounded bg-blue-50">
              <p className="text-xs text-blue-700">
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

/**
 * A page with tall content demonstrates that the dialog keeps a fixed height
 * (`height="xl"`) and scrolls internally, while the page's `fixedContent`
 * (here a SearchInput) stays pinned above the scrolling area.
 * @summary Scrollable page body with pinned fixedContent.
 */
export const ScrollableContent: Story = {
  render: () => {
    const [currentPageId, setCurrentPageId] = useState("long-form");
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    const handleSave = () => {
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
        icon: File04,
        fixedContent: (
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            name="search-content"
            placeholder="Search through content..."
          />
        ),
        content: (
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-lg font-semibold">
                Terms and Conditions
              </h3>
              <p className="text-sm text-muted-foreground">
                This page contains a lot of content to demonstrate scrolling
                functionality with a fixed search input. The search input stays
                visible while scrolling through the content below.
              </p>
              {searchTerm && (
                <div className="rounded-md border bg-yellow-50 p-3">
                  <p className="text-sm text-yellow-800">
                    🔍 Searching for: <strong>{searchTerm}</strong>
                  </p>
                </div>
              )}
            </div>

            {Array.from({ length: 15 }, (_, i) => (
              <div key={i} className="space-y-3">
                <h4 className="text-md font-semibold">Section {i + 1}</h4>
                <p className="text-sm text-muted-foreground">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed
                  do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                  Ut enim ad minim veniam, quis nostrud exercitation ullamco
                  laboris nisi ut aliquip ex ea commodo consequat. Duis aute
                  irure dolor in reprehenderit in voluptate velit esse cillum
                  dolore eu fugiat nulla pariatur.
                </p>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm font-medium">Field {i + 1}</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border px-3 py-2"
                      placeholder={`Enter value for field ${i + 1}`}
                    />
                  </div>
                  {i % 3 === 0 && (
                    <div>
                      <label className="text-sm font-medium">
                        Additional Notes
                      </label>
                      <textarea
                        className="mt-1 w-full rounded-md border px-3 py-2"
                        placeholder="Add any additional notes here..."
                        rows={3}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div className="rounded-md border bg-blue-50 p-4">
              <h4 className="mb-2 text-sm font-semibold text-blue-900">
                Fixed Content Test Complete
              </h4>
              <p className="text-xs text-blue-700">
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
        icon: Settings01,
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-lg font-semibold">Form Summary</h3>
              <p className="text-sm text-muted-foreground">
                Thank you for testing the scrollable content functionality.
              </p>
            </div>
            <div className="rounded-md border bg-green-50 p-3">
              <p className="text-sm text-green-700">
                ✓ Scrolling functionality verified
              </p>
              <p className="text-sm text-green-700">
                ✓ Fixed dialog height maintained
              </p>
              <p className="text-sm text-green-700">
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

/**
 * The tool-approval pattern: `isAlertDialog` with `hideCloseButton` forces an
 * explicit Allow / Decline choice for each queued validation request, with
 * async loading state on the buttons and paging through pending requests.
 * @summary Alert-dialog mode for sequential tool approvals.
 */
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
          <div className="space-y-6 pt-4">
            <div>
              <p className="mb-6 text-sm text-muted-foreground">
                Allow{" "}
                <span className="font-semibold">@Marketing Assistant</span> to
                use the tool <span className="font-semibold">Send Email</span>{" "}
                from <span className="font-semibold">Gmail</span>?
              </p>

              <div className="space-y-3">
                <Collapsible>
                  <CollapsibleTrigger>
                    <span className="text-sm font-medium text-muted-foreground">
                      Details
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 rounded-md border bg-muted p-3">
                      <h4 className="mb-2 text-sm font-medium">
                        Email Details
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium">To:</span>{" "}
                          john.doe@example.com
                        </div>
                        <div>
                          <span className="font-medium">Subject:</span> Welcome
                          to our platform!
                        </div>
                        <div>
                          <span className="font-medium">Content:</span> Thank
                          you for signing up...
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {errorMessage && (
                  <div className="flex items-center gap-2 text-sm font-medium text-warning-800">
                    <AlertCircle className="h-4 w-4" />
                    {errorMessage}
                  </div>
                )}

                <div className="mt-4">
                  <label className="copy-xs flex w-fit cursor-pointer flex-row items-center gap-2 py-2 pr-2 font-normal">
                    <Checkbox
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
          <div className="space-y-6 pt-4">
            <div>
              <p className="mb-6 text-sm text-muted-foreground">
                Allow{" "}
                <span className="font-semibold">@Marketing Assistant</span> to
                use the tool{" "}
                <span className="font-semibold">Send Bulk Email</span> from{" "}
                <span className="font-semibold">Gmail</span>?
              </p>

              <div className="space-y-3">
                <Collapsible>
                  <CollapsibleTrigger>
                    <span className="text-sm font-medium text-muted-foreground">
                      Details
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 rounded-md border bg-muted p-3">
                      <h4 className="mb-2 text-sm font-medium">
                        Campaign Details
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium">Recipients:</span> 1,250
                          subscribers
                        </div>
                        <div>
                          <span className="font-medium">Subject:</span> Monthly
                          Newsletter - March 2024
                        </div>
                        <div>
                          <span className="font-medium">Template:</span>{" "}
                          Newsletter Template v2
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <div className="rounded-md border bg-blue-50 p-3">
                  <h4 className="mb-1 text-sm font-medium text-blue-900">
                    Security Notice
                  </h4>
                  <p className="text-xs text-blue-700">
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
          <div className="space-y-6 pt-4">
            <div>
              <p className="mb-6 text-sm text-muted-foreground">
                Allow{" "}
                <span className="font-semibold">@Marketing Assistant</span> to
                use the tool{" "}
                <span className="font-semibold">Create Email Template</span>{" "}
                from <span className="font-semibold">Gmail</span>?
              </p>

              <div className="space-y-3">
                <Collapsible>
                  <CollapsibleTrigger>
                    <span className="text-sm font-medium text-muted-foreground">
                      Details
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 rounded-md border bg-muted p-3">
                      <h4 className="mb-2 text-sm font-medium">
                        Template Details
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium">Name:</span> Welcome
                          Series - Day 1
                        </div>
                        <div>
                          <span className="font-medium">Category:</span>{" "}
                          Onboarding
                        </div>
                        <div>
                          <span className="font-medium">Variables:</span>{" "}
                          {"{{name}}"}, {"{{company}}"}, {"{{trial_end_date}}"}
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <div className="rounded-md border bg-green-50 p-3">
                  <h4 className="mb-1 text-sm font-medium text-green-900">
                    Low Risk Action
                  </h4>
                  <p className="text-xs text-green-700">
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
            <div className="flex flex-row justify-end gap-2">
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
