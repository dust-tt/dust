import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button } from "@sparkle/components";

import {
  NewDialog,
  NewDialogContainer,
  NewDialogContent,
  NewDialogDescription,
  NewDialogFooter,
  NewDialogHeader,
  NewDialogTitle,
  NewDialogTrigger,
} from "../index_with_tw_base";

const meta: Meta<typeof NewDialog> = {
  title: "Components/NewDialog",
  component: NewDialog,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof NewDialog>;

export const Basic: Story = {
  render: () => (
    <NewDialog>
      <NewDialogTrigger asChild>
        <Button label="Open NewDialog" />
      </NewDialogTrigger>
      <NewDialogContent>
        <NewDialogHeader>
          <NewDialogTitle>Edit Profile</NewDialogTitle>
          <NewDialogDescription>
            Make changes to your profile settings here
          </NewDialogDescription>
        </NewDialogHeader>
        <NewDialogContainer>
          Your profile details will be updated based on the information you
          provide.
        </NewDialogContainer>
        <NewDialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Save Changes",
            variant: "highlight",
          }}
        />
      </NewDialogContent>
    </NewDialog>
  ),
};

export const WithForm: Story = {
  render: () => (
    <NewDialog>
      <NewDialogTrigger asChild>
        <Button label="Edit User" />
      </NewDialogTrigger>
      <NewDialogContent size="lg">
        <NewDialogHeader>
          <NewDialogTitle>Edit User Settings</NewDialogTitle>
        </NewDialogHeader>
        <NewDialogContainer>
          <div className="s-grid s-gap-4 s-py-4">
            <div className="s-grid s-gap-2">
              <label className="s-text-sm s-font-medium">Name</label>
              <input
                className="s-border-input s-rounded-md s-border s-bg-transparent s-px-3 s-py-1 s-text-sm"
                placeholder="Enter name..."
              />
            </div>
            <div className="s-grid s-gap-2">
              <label className="s-text-sm s-font-medium">Email</label>
              <input
                className="s-border-input s-rounded-md s-border s-bg-transparent s-px-3 s-py-1 s-text-sm"
                placeholder="Enter email..."
                type="email"
              />
            </div>
          </div>
        </NewDialogContainer>
        <NewDialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
          }}
          rightButtonProps={{
            label: "Save",
            variant: "primary",
          }}
        />
      </NewDialogContent>
    </NewDialog>
  ),
};

export const AlertNewDialog: Story = {
  render: () => (
    <NewDialog>
      <NewDialogTrigger asChild>
        <Button variant="warning" label="Delete Account" />
      </NewDialogTrigger>
      <NewDialogContent size="md">
        <NewDialogHeader>
          <NewDialogTitle>Are you absolutely sure?</NewDialogTitle>
          <NewDialogDescription>
            This action cannot be undone. This will permanently delete your
            account and remove your data from our servers.
          </NewDialogDescription>
        </NewDialogHeader>
        <NewDialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
          }}
          rightButtonProps={{
            label: "Delete Account",
            variant: "warning",
          }}
        />
      </NewDialogContent>
    </NewDialog>
  ),
};

export const LargeContent: Story = {
  render: () => (
    <NewDialog>
      <NewDialogTrigger asChild>
        <Button label="View Terms" />
      </NewDialogTrigger>
      <NewDialogContent size="xl">
        <NewDialogHeader>
          <NewDialogTitle>Terms of Service</NewDialogTitle>
        </NewDialogHeader>
        <NewDialogContainer>
          <div className="s-space-y-4">
            <h3 className="s-font-semibold">1. Introduction</h3>
            <p className="s-text-sm s-text-muted-foreground">
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Quod
              possimus sit modi reprehenderit sed dolorem nisi nostrum,
              dignissimos tempora eligendi!
            </p>
            <h3 className="s-font-semibold">2. Terms of Use</h3>
            <p className="s-text-sm s-text-muted-foreground">
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Quod
              possimus sit modi reprehenderit sed dolorem nisi nostrum,
              dignissimos tempora eligendi!
            </p>
            <h3 className="s-font-semibold">3. Privacy Policy</h3>
            <p className="s-text-sm s-text-muted-foreground">
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Quod
              possimus sit modi reprehenderit sed dolorem nisi nostrum,
              dignissimos tempora eligendi!
            </p>
          </div>
        </NewDialogContainer>
      </NewDialogContent>
    </NewDialog>
  ),
};
