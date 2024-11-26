import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  ConversationMessageFeedbackSelectorProps,
  FeedbackSelector,
} from "@sparkle/components/ConversationMessageFeedbackSelector";

const meta = {
  title: "Primitives/FeedbackSelector",
  component: FeedbackSelector,
  argTypes: {
    feedback: {
      thumb: "up",
      feedbackContent: null,
    },
    onSubmitThumb: {
      description: "The submit function",
      control: {
        type: "object",
      },
    },
    isSubmittingThumb: {
      description: "Whether the thumb is submitting",
      control: {
        type: "boolean",
      },
    },
  },
} satisfies Meta<React.ComponentProps<typeof FeedbackSelector>>;

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
  args: {
    feedback: {
      thumb: "up",
      feedbackContent: null,
    },
    onSubmitThumb: async (element) => {
      console.log(element);
    },
    isSubmittingThumb: false,
  },
  render: () => <ExampleFeedbackComponent />,
};
