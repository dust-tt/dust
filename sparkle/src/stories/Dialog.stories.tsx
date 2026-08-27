import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Avatar, Button, Input, SearchInput } from "@sparkle/components";

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
  title: "Overlays/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `A modal surface that interrupts the flow to focus the user on a single task or decision — confirmations, short forms, or tool-permission prompts. Compose it from **DialogTrigger**, **DialogContent**, **DialogHeader** (with **DialogTitle** / **DialogDescription**), **DialogContainer**, and **DialogFooter**.

**When to use**
- To require a decision or confirmation before continuing.
- To confirm a destructive or irreversible action.

**Guidelines**
- Keep a dialog to a single, focused task; for multi-step flows use **MultiPageDialog**.
- Label footer buttons with the action they perform ("Save changes", "Delete") rather than "OK".
- For non-blocking, contextual information use **ContentMessage**; for transient feedback use **Notification**.`,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Dialog>;

/**
 * The canonical composition: trigger, header with title and description,
 * body content, and a cancel / confirm footer. Dialog is compositional, so
 * stories are render-based rather than args-driven.
 * @summary Canonical confirm dialog composition.
 */
export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button label="Open Dialog" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enable notifications for new messages</DialogTitle>
          <DialogDescription>
            Make changes to your profile settings here
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          Get notified in your browser when messages arrive.
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

/**
 * The tool-permission prompt shape used in product: a **DialogTitle** with a
 * leading Avatar `visual` (here the Slack logo) above an allow / cancel
 * decision.
 * @summary Tool-usage confirmation with an avatar title.
 */
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
            <span className="mono text-muted-foreground">[toolset_name]</span>,
            <span className="mono text-muted-foreground">[tool_name]</span>
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
        />
      </DialogContent>
    </Dialog>
  ),
};

/**
 * A short form inside the dialog body — **DialogContainer** hosting a couple
 * of **Input** fields with a save / cancel footer.
 * @summary Dialog hosting a short form.
 */
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
          <div className="grid gap-4">
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
        />
      </DialogContent>
    </Dialog>
  ),
};

/**
 * A Dialog used as a destructive confirmation: `warning`-variant trigger and
 * confirm buttons, an irreversibility note in the body, and a compact
 * `DialogContent size="md"`.
 * @summary Destructive-action confirmation dialog.
 */
export const DestructiveConfirmation: Story = {
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
        />
      </DialogContent>
    </Dialog>
  ),
};

/**
 * Scroll behavior for long content: `DialogContent size="2xl" height="md"`
 * caps the dialog's dimensions so the body scrolls, while
 * **DialogContainer**'s `fixedContent` slot pins a search input above the
 * scrolling area.
 * @summary Scrolling dialog with pinned fixed content.
 */
export const LargeContent: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button label="View Terms" />
      </DialogTrigger>
      <DialogContent size="2xl" height="md">
        <DialogHeader>
          <DialogTitle>Terms of Service</DialogTitle>
        </DialogHeader>
        <DialogContainer
          fixedContent={
            <SearchInput
              value=""
              onChange={() => {}}
              name="search-terms"
              placeholder="Search terms..."
            />
          }
        >
          <div className="space-y-4">
            <h3 className="font-semibold">1. Introduction</h3>
            <p className="text-sm text-muted-foreground">
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Quod
              possimus sit modi reprehenderit sed dolorem nisi nostrum,
              dignissimos tempora eligendi! Sed enim sapiente molestias pariatur
              earum ipsum exercitationem corrupti voluptates?
            </p>
            <h3 className="font-semibold">2. Terms of Use</h3>
            <p className="text-sm text-muted-foreground">
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Quod
              possimus sit modi reprehenderit sed dolorem nisi nostrum,
              dignissimos tempora eligendi! Minus voluptatem iste accusantium
              delectus nesciunt adipisci vitae earum similique.
            </p>
            <h3 className="font-semibold">3. Privacy Policy</h3>
            <p className="text-sm text-muted-foreground">
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Quod
              possimus sit modi reprehenderit sed dolorem nisi nostrum,
              dignissimos tempora eligendi! Facere explicabo aliquam corporis
              error consectetur veniam assumenda.
            </p>
            <h3 className="font-semibold">4. Data Processing</h3>
            <p className="text-sm text-muted-foreground">
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Dolorem
              ipsum inventore vel, voluptatem fugiat necessitatibus reiciendis
              accusantium dignissimos optio error.
            </p>
            <h3 className="font-semibold">5. User Rights</h3>
            <p className="text-sm text-muted-foreground">
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Deserunt
              architecto dolorem corrupti accusamus optio neque officia
              perferendis molestiae.
            </p>
            <h3 className="font-semibold">6. Additional Terms</h3>
            <p className="text-sm text-muted-foreground">
              More content to make the dialog scrollable and test the fixed
              search input functionality. Lorem ipsum dolor sit amet consectetur
              adipisicing elit. Quod possimus sit modi reprehenderit sed dolorem
              nisi nostrum.
            </p>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Accept",
            variant: "highlight",
          }}
        />
      </DialogContent>
    </Dialog>
  ),
};

/**
 * True full screen: `DialogContent size="full" height="full"` covers the whole
 * viewport, edge to edge, with no rounded corners or border.
 * @summary Full screen dialog covering the viewport.
 */
export const FullScreen: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button label="Open full screen" />
      </DialogTrigger>
      <DialogContent size="full" height="full">
        <DialogHeader>
          <DialogTitle>Full screen dialog</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <p className="text-sm text-muted-foreground">
            This dialog covers the entire viewport, like a full page.
          </p>
        </DialogContainer>
        <DialogFooter
          rightButtonProps={{
            label: "Close",
            variant: "highlight",
          }}
        />
      </DialogContent>
    </Dialog>
  ),
};
