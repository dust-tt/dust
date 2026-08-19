import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  GithubLogo,
  Input,
  PersonalAuthenticationCard,
} from "../index_with_tw_base";

const meta = {
  title: "Product/Conversation/PersonalAuthenticationCard",
  component: PersonalAuthenticationCard,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Prompts a user to connect a personal account before a blocked action can continue. The product layer supplies the service metadata, optional credential inputs, and connection handlers.",
      },
    },
  },
  args: {
    icon: GithubLogo,
    serviceName: "GitHub",
    canRespond: true,
    isConnecting: false,
    isResolving: false,
    connectDisabled: false,
    onDecline: () => undefined,
    onConnect: () => undefined,
  },
} satisfies Meta<typeof PersonalAuthenticationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithCredentialInputs: Story = {
  args: {
    credentialInputs: (
      <Input
        id="workspace-domain"
        name="workspace-domain"
        label="Workspace domain"
        placeholder="example.com"
      />
    ),
  },
};

export const Connecting: Story = {
  args: {
    isConnecting: true,
  },
};

export const WaitingForAnotherUser: Story = {
  args: {
    canRespond: false,
    triggeringUserName: "Alex Smith",
    onDecline: undefined,
    onConnect: undefined,
  },
};
