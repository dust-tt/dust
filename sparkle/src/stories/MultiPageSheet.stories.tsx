import type { Meta, StoryObj } from "@storybook/react";
import type { ColumnDef } from "@tanstack/react-table";
import React, { useCallback, useState } from "react";
import { fn } from "storybook/test";

import { Button } from "@sparkle/components/Button";
import { ScrollableDataTable } from "@sparkle/components/DataTable";
import {
  MultiPageSheet,
  MultiPageSheetContent,
  type MultiPageSheetPage,
  MultiPageSheetTrigger,
} from "@sparkle/components/MultiPageSheet";
import { File04, Settings01, User01 } from "@sparkle/icons/v2-stroke";

const meta: Meta<typeof MultiPageSheetContent> = {
  title: "Overlays/MultiPageSheet",
  component: MultiPageSheetContent,
  parameters: {
    docs: {
      description: {
        component: `A side **Sheet** that hosts multiple **pages**, combining a slide-in panel with step-based navigation. Built from **MultiPageSheetTrigger** and **MultiPageSheetContent**, it takes an array of \`pages\` (each with \`id\`, \`title\`, optional \`description\` / \`icon\`, \`content\`, optional per-page \`footerContent\`, and a \`noScroll\` flag), plus \`currentPageId\` / \`onPageChange\`. It supports \`size\`, an \`onSave\` callback, built-in \`showNavigation\` with \`disableNext\` / \`disableSave\` guards.

**When to use**
- For multi-step flows or detail panels that should keep the underlying page partially visible.
- When a page hosts tall or scrollable content (e.g. a **ScrollableDataTable**) better suited to a wide side panel.

**Guidelines**
- Use \`disableNext\` / \`disableSave\` to gate progression until the current step is valid.
- Set a page's \`noScroll\` when it manages its own internal scrolling (e.g. a data table).
- For a focus-stealing centered modal flow, use **MultiPageDialog** instead.`,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const samplePages: MultiPageSheetPage[] = [
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

const MultiPageSheetDemo = () => {
  const [currentPageId, setCurrentPageId] = useState("profile");

  const handleSave = fn();

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

/**
 * Baseline setup: three static pages with header navigation, the built-in
 * footer, and an `onSave` callback. Same content as MultiPageDialog's
 * `Default` but as a slide-in side panel — choose the Sheet when the user
 * should keep the underlying page visible instead of a blocking modal.
 * @summary Basic three-page sheet with built-in save footer.
 */
export const Default: Story = {
  render: () => <MultiPageSheetDemo />,
};

/**
 * A three-step wizard where each page writes into shared `formData` and
 * progression happens through in-content buttons that unlock as the step
 * becomes valid. Prefer this Sheet variant over MultiPageDialog when the
 * flow benefits from staying anchored beside the page (e.g. configuring
 * against visible context).
 * @summary Wizard with per-page form state driven from page content.
 */
export const WizardWithFormState: Story = {
  render: () => {
    const [currentPageId, setCurrentPageId] = useState("step1");
    const [formData, setFormData] = useState({
      name: "",
      email: "",
      selectedFile: "",
      notifications: false,
    });

    const handleSave = fn();

    const interactivePages: MultiPageSheetPage[] = [
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
              <div className="pt-2">
                <Button
                  label="Continue to File Selection"
                  variant="primary"
                  size="sm"
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
            {formData.selectedFile && (
              <div className="pt-2">
                <Button
                  label="Continue to Settings"
                  variant="primary"
                  size="sm"
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
      <MultiPageSheet>
        <MultiPageSheetTrigger asChild>
          <Button label="Open Interactive Setup" />
        </MultiPageSheetTrigger>
        <MultiPageSheetContent
          pages={interactivePages}
          currentPageId={currentPageId}
          onPageChange={setCurrentPageId}
          size="lg"
          onSave={handleSave}
        />
      </MultiPageSheet>
    );
  },
};

/**
 * Uses the built-in navigation (`showNavigation`) with `disableNext` /
 * `disableSave` guards so each step must be valid before moving on, plus a
 * per-page `footerContent` slot. This gating lives in the Sheet's own footer,
 * unlike MultiPageDialog where you wire footer buttons yourself.
 * @summary Built-in navigation gated by disableNext / disableSave.
 */
export const WithConditionalNavigation: Story = {
  render: () => {
    const [currentPageId, setCurrentPageId] = useState("data-selection");
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [description, setDescription] = useState("");

    const handleSave = fn();

    const conditionalPages: MultiPageSheetPage[] = [
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
        footerContent: (
          <div className="w-full border border-border-dark">
            This is a footer content
          </div>
        ),
      },
    ];

    return (
      <MultiPageSheet>
        <MultiPageSheetTrigger asChild>
          <Button label="Open Configuration Wizard" />
        </MultiPageSheetTrigger>
        <MultiPageSheetContent
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
        />
      </MultiPageSheet>
    );
  },
};

// Sample data types for the ScrollableDataTable
interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastActive: string;
  onClick?: () => void;
}

// Generate random user data
const generateRandomUsers = (
  count: number,
  startId: number = 0
): UserData[] => {
  const roles = ["Admin", "User", "Manager", "Developer", "Designer"];
  const statuses = ["Active", "Inactive", "Pending"];
  const firstNames = [
    "John",
    "Jane",
    "Mike",
    "Sarah",
    "David",
    "Lisa",
    "Tom",
    "Anna",
    "Chris",
    "Emma",
  ];
  const lastNames = [
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
    "Davis",
    "Rodriguez",
    "Martinez",
  ];

  return Array.from({ length: count }, (_, index) => {
    const absoluteIndex = startId + index;
    const firstName = firstNames[absoluteIndex % firstNames.length];
    const lastName = lastNames[(absoluteIndex * 3) % lastNames.length];
    const id = (absoluteIndex + 1).toString();

    return {
      id,
      name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      role: roles[absoluteIndex % roles.length],
      status: statuses[absoluteIndex % statuses.length],
      lastActive: new Date(
        Date.now() - (absoluteIndex % 30) * 24 * 60 * 60 * 1000
      ).toLocaleDateString(),
      onClick: fn(),
    };
  });
};

/**
 * The Sheet-specific pattern this component exists for: a page flagged
 * `noScroll` hosting a ScrollableDataTable that manages its own infinite
 * scrolling (`onLoadMore` + `isLoading`) inside the wide side panel. Use this
 * over MultiPageDialog whenever a step contains tall, self-scrolling content
 * like a data table.
 * @summary noScroll page hosting an infinite-scroll data table.
 */
export const WithScrollableDataTable: Story = {
  render() {
    const [currentPageId, setCurrentPageId] = useState("users");
    const [users, setUsers] = useState<UserData[]>(() =>
      generateRandomUsers(50)
    );
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    // Define columns for the data table
    const columns: ColumnDef<UserData>[] = [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="font-medium">{row.getValue("name")}</div>
        ),
        meta: { sizeRatio: 25 },
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <div className="text-muted-foreground">{row.getValue("email")}</div>
        ),
        meta: { sizeRatio: 30 },
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => (
          <div className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
            {row.getValue("role")}
          </div>
        ),
        meta: { sizeRatio: 15 },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.getValue("status") as string;
          const colorClass =
            status === "Active"
              ? "bg-green-100 text-green-800"
              : status === "Inactive"
                ? "bg-red-100 text-red-800"
                : "bg-yellow-100 text-yellow-800";

          return (
            <div
              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${colorClass}`}
            >
              {status}
            </div>
          );
        },
        meta: { sizeRatio: 15 },
      },
      {
        accessorKey: "lastActive",
        header: "Last Active",
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {row.getValue("lastActive")}
          </div>
        ),
        meta: { sizeRatio: 15 },
      },
    ];

    // Handle infinite loading
    const handleLoadMore = useCallback(() => {
      if (isLoading || !hasMore) {
        return;
      }

      setIsLoading(true);

      // Simulate API call delay
      setTimeout(() => {
        const newUsers = generateRandomUsers(25, users.length);
        setUsers((prev) => [...prev, ...newUsers]);
        setIsLoading(false);

        // Stop loading more after reaching 200 items for demo purposes
        if (users.length >= 175) {
          setHasMore(false);
        }
      }, 1000);
    }, [isLoading, hasMore, users.length]);

    const handleSave = fn();

    const scrollableDataTablePages: MultiPageSheetPage[] = [
      {
        id: "users",
        title: "User Management",
        description: "Manage users with infinite scroll",
        icon: User01,
        noScroll: true,
        content: (
          <div className="flex h-full flex-col space-y-4">
            <div className="flex-shrink-0">
              <h3 className="mb-2 text-lg font-semibold">Users Database</h3>
              <p className="text-sm text-muted-foreground">
                Browse through all users with infinite scrolling. Click on any
                row to view details.
              </p>
            </div>
            <ScrollableDataTable
              className="min-h-0"
              data={users}
              columns={columns}
              maxHeight={true}
              onLoadMore={hasMore ? handleLoadMore : undefined}
              isLoading={isLoading}
              enableRowSelection={false}
            />
            <div className="flex-shrink-0 text-xs text-muted-foreground">
              Showing {users.length} users{" "}
              {hasMore ? "(loading more available)" : "(all users loaded)"}
            </div>
          </div>
        ),
      },
    ];

    return (
      <MultiPageSheet>
        <MultiPageSheetTrigger asChild>
          <Button label="Open User Management" />
        </MultiPageSheetTrigger>
        <MultiPageSheetContent
          pages={scrollableDataTablePages}
          currentPageId={currentPageId}
          onPageChange={setCurrentPageId}
          size="xl"
          onSave={handleSave}
        />
      </MultiPageSheet>
    );
  },
};
