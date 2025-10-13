import type { Meta, StoryObj } from "@storybook/react";
import type { ColumnDef } from "@tanstack/react-table";
import React, { useCallback, useState } from "react";

import { Button } from "@sparkle/components/Button";
import { ScrollableDataTable } from "@sparkle/components/DataTable";
import {
  MultiPageSheet,
  MultiPageSheetContent,
  type MultiPageSheetPage,
  MultiPageSheetTrigger,
} from "@sparkle/components/MultiPageSheet";
import { Cog6ToothIcon, DocumentTextIcon, UserIcon } from "@sparkle/icons/app";

const meta: Meta<typeof MultiPageSheetContent> = {
  title: "Modules/MultiPageSheet",
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

    const interactivePages: MultiPageSheetPage[] = [
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

    const conditionalPages: MultiPageSheetPage[] = [
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
        footerContent: (
          <div className="s-w-full s-border s-border-border-dark">
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
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const id = (startId + index + 1).toString();

    return {
      id,
      name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      role: roles[Math.floor(Math.random() * roles.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      lastActive: new Date(
        Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000
      ).toLocaleDateString(),
      onClick: () => alert(`Clicked on user: ${firstName} ${lastName}`),
    };
  });
};

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
          <div className="s-font-medium">{row.getValue("name")}</div>
        ),
        meta: { sizeRatio: 25 },
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <div className="s-text-muted-foreground">{row.getValue("email")}</div>
        ),
        meta: { sizeRatio: 30 },
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => (
          <div className="s-inline-flex s-rounded-full s-bg-blue-100 s-px-2 s-py-1 s-text-xs s-font-semibold s-text-blue-800">
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
              ? "s-bg-green-100 s-text-green-800"
              : status === "Inactive"
                ? "s-bg-red-100 s-text-red-800"
                : "s-bg-yellow-100 s-text-yellow-800";

          return (
            <div
              className={`s-inline-flex s-rounded-full s-px-2 s-py-1 s-text-xs s-font-semibold ${colorClass}`}
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
          <div className="s-text-sm s-text-muted-foreground">
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

    const handleSave = () => {
      alert("User data saved!");
    };

    const scrollableDataTablePages: MultiPageSheetPage[] = [
      {
        id: "users",
        title: "User Management",
        description: "Manage users with infinite scroll",
        icon: UserIcon,
        noScroll: true,
        content: (
          <div className="s-flex s-h-full s-flex-col s-space-y-4">
            <div className="s-flex-shrink-0">
              <h3 className="s-mb-2 s-text-lg s-font-semibold">
                Users Database
              </h3>
              <p className="s-text-sm s-text-muted-foreground">
                Browse through all users with infinite scrolling. Click on any
                row to view details.
              </p>
            </div>
            <ScrollableDataTable
              className="s-min-h-0"
              data={users}
              columns={columns}
              maxHeight={true}
              onLoadMore={hasMore ? handleLoadMore : undefined}
              isLoading={isLoading}
              enableRowSelection={false}
            />
            <div className="s-flex-shrink-0 s-text-xs s-text-muted-foreground">
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
