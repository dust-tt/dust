import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import { Button } from "@sparkle/components/Button";
import {
  MultiPageSheet,
  MultiPageSheetContent,
  type MultiPageSheetPage,
  MultiPageSheetTrigger,
} from "@sparkle/components/MultiPageSheet";
import { Cog6ToothIcon, DocumentTextIcon, UserIcon } from "@sparkle/icons/app";

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
