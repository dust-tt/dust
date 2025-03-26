import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button } from "@sparkle/components";

import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../index_with_tw_base";

const meta: Meta<typeof Dialog> = {
  title: "Components/Dialog",
  component: Dialog,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Dialog>;

export const Basic: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button label="Open Dialog" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile settings here
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          Your profile details will be updated based on the information you
          provide.
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Save Changes",
            variant: "highlight",
          }}
        />
      </DialogContent>
    </Dialog>
  ),
};

export const WithForm: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button label="Edit User" />
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Edit User Settings</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="s-grid s-gap-4 s-py-4">
            <div className="s-grid s-gap-2">
              <label className="s-text-sm s-font-semibold">Name</label>
              <input
                className="s-border-input s-rounded-md s-border s-bg-transparent s-px-3 s-py-1 s-text-sm"
                placeholder="Enter name..."
              />
            </div>
            <div className="s-grid s-gap-2">
              <label className="s-text-sm s-font-semibold">Email</label>
              <input
                className="s-border-input s-rounded-md s-border s-bg-transparent s-px-3 s-py-1 s-text-sm"
                placeholder="Enter email..."
                type="email"
              />
            </div>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
          }}
          rightButtonProps={{
            label: "Save",
            variant: "primary",
          }}
        />
      </DialogContent>
    </Dialog>
  ),
};

export const AlertDialog: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="warning" label="Delete Account" />
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Are you absolutely sure?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete your
            account and remove your data from our servers.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
          }}
          rightButtonProps={{
            label: "Delete Account",
            variant: "warning",
          }}
        />
      </DialogContent>
    </Dialog>
  ),
};

export const LargeContent: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button label="View Terms" />
      </DialogTrigger>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Terms of Service</DialogTitle>
        </DialogHeader>
        <DialogContainer>
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
        </DialogContainer>
      </DialogContent>
    </Dialog>
  ),
};
