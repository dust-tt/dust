import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  ConversationMessageFeedbackSelectorProps,
  FeedbackSelector,
} from "@sparkle/components/ConversationMessageActions";

import { ConversationMessageActions } from "../index_with_tw_base";

const meta = {
  title: "Primitives/FeedbackSelector",
  component: ConversationMessageActions,
  argTypes: {
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
const ExampleFeedbackComponent = () => {
  const [messageFeedback, setMessageFeedback] =
    React.useState<ConversationMessageFeedbackSelectorProps>({
      feedback: {
        thumb: "up",
        feedbackContent: null,
      },
      onSubmitThumb: async (element) => {
        setMessageFeedback((prev) => ({
          ...prev,
          feedback: {
            thumb: element.thumb,
            feedbackContent: element.feedbackContent,
          },
        }));
      },
      isSubmittingThumb: false,
    });

  return <FeedbackSelector {...messageFeedback} />;
};

export const ExamplePicker: Story = {
  render: () => <ExampleFeedbackComponent />,
};
