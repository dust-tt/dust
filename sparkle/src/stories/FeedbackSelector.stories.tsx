import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  FeedbackSelector,
  FeedbackSelectorProps,
} from "@sparkle/components/FeedbackSelector";

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
    React.useState<FeedbackSelectorProps>({
      feedback: null,
      onSubmitThumb: async (element) => {
        setMessageFeedback((prev) => ({
          ...prev,
          feedback: element.isToRemove
            ? null
            : {
                thumb: element.thumb,
                feedbackContent: element.feedbackContent,
                isConversationShared: element.isConversationShared,
              },
        }));
      },
      isSubmittingThumb: false,
      getPopoverInfo: () => <div>Some info here, like the last author</div>,
    });

  return <FeedbackSelector {...messageFeedback} />;
};

export const ExamplePicker: Story = {
  args: {
    feedback: {
      thumb: "up",
      feedbackContent: null,
      isConversationShared: true,
    },
    onSubmitThumb: async (element) => {
      console.log(element);
    },
    isSubmittingThumb: false,
  },
  render: () => <ExampleFeedbackComponent />,
};
