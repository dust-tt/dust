import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Avatar, Button, Input } from "@sparkle/components";

import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  SlackLogo,
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
          permanentValidation={{
            label: "Don't ask again",
            checked: false,
            onChange: () => {},
          }}
        />
      </DialogContent>
    </Dialog>
  ),
};

export const ToolValidation: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button label="Open Dialog" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle
            visual={<Avatar size="xs" icon={SlackLogo} hexBgColor="#421D51" />}
          >
            Confirm tool usage
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div>
            Allow [Agent_name] to use the tool (
            <span className="s-mono s-text-muted-foreground dark:s-text-muted-foreground-night">
              [toolset_name]
            </span>
            ,
            <span className="s-mono s-text-muted-foreground dark:s-text-muted-foreground-night">
              [tool_name]
            </span>
            )?
          </div>
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
          permanentValidation={{
            label: "Always allow",
            checked: false,
            onChange: () => {},
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User Settings</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="s-grid s-gap-4">
            <Input label="Email" placeholder="Email" />
            <Input label="Username" placeholder="Username" />
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Save",
            variant: "highlight",
          }}
          permanentValidation={{
            label: "Don't ask again",
            checked: false,
            onChange: () => {},
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
        </DialogHeader>
        <DialogContainer>
          This action cannot be undone. This will permanently delete your
          account and remove your data from our servers.
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Delete Account",
            variant: "warning",
          }}
          permanentValidation={{
            label: "Don't ask again",
            checked: false,
            onChange: () => {},
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
