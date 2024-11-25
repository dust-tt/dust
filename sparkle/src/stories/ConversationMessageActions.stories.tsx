import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  ConversationMessageEmojiSelectorProps,
  ConversationMessageFeedbackSelectorProps,
} from "@sparkle/components/ConversationMessageActions";

import {
  ArrowPathIcon,
  Button,
  ClipboardIcon,
  ConversationMessageActions,
} from "../index_with_tw_base";

const messageEmoji: ConversationMessageEmojiSelectorProps = {
  reactions: [
    {
      emoji: "disguised_face",
      hasReacted: true,
      count: 3,
    },
  ],
  onSubmitEmoji: async () => {},
  isSubmittingEmoji: false,
};

const meta = {
  title: "Primitives/ConversationMessageActions",
  component: ConversationMessageActions,
  argTypes: {
    buttons: {
      description: "The buttons to display",
      control: "object",
    },
    messageEmoji: {
      description: "The emoji selector to display",
      control: {
        type: "object",
      },
    },
    messageFeedback: {
      description: "Whether to show the thumbs selector",
      control: {
        type: "object",
      },
    },
  },
} satisfies Meta<React.ComponentProps<typeof ConversationMessageActions>>;

export default meta;
type Story = StoryObj<typeof meta>;

// Wrap the story in a component that can use hooks
const ExamplePickerComponent = () => {
  const buttons = React.useMemo(
    () => [
      <Button
        key="copy-msg-button"
        tooltip="Copy to clipboard"
        variant="outline"
        size="xs"
        onClick={() => {
          console.log("Copy to clipboard");
        }}
        icon={ClipboardIcon}
      />,
      <Button
        key="retry-msg-button"
        tooltip="Retry"
        variant="outline"
        size="xs"
        onClick={() => {
          console.log("Retry");
        }}
        icon={ArrowPathIcon}
        disabled={false}
      />,
    ],
    []
  );

  const [messageFeedback, setMessageThumb] =
    React.useState<ConversationMessageFeedbackSelectorProps>({
      feedback: {
        thumb: "up",
        feedbackContent: null,
      },
      onSubmitThumb: async (element) => {
        setMessageThumb((prev) => ({
          ...prev,
          feedback: {
            thumb: element.thumb,
            feedbackContent: element.feedbackContent,
          },
        }));
      },
      isSubmittingThumb: false,
    });

  return (
    <ConversationMessageActions
      buttons={buttons}
      messageEmoji={messageEmoji}
      messageFeedback={messageFeedback}
    />
  );
};

export const ExamplePicker: Story = {
  render: () => <ExamplePickerComponent />,
};
