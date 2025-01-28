import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { HorizontalCollapsible } from "./HorizontalCollapsible";

type ComponentType = typeof HorizontalCollapsible;

const meta = {
  title: "Components/HorizontalCollapsible",
  component: HorizontalCollapsible,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<ComponentType>;

export default meta;
type Story = StoryObj<ComponentType>;

const SAMPLE_IMAGE =
  "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=400&h=300&fit=crop";

export const Default: Story = {
  args: {
    children: (
      <HorizontalCollapsible.Item value="1">
        <HorizontalCollapsible.Image
          src={SAMPLE_IMAGE}
          alt="Colorful gradient"
        />
        <div>
          <HorizontalCollapsible.Button>
            Click to expand
          </HorizontalCollapsible.Button>
          <HorizontalCollapsible.Panel>
            <p className="s-mt-2">
              This is the expandable content that appears when you click the
              button. It can contain any React components or HTML elements.
            </p>
          </HorizontalCollapsible.Panel>
        </div>
      </HorizontalCollapsible.Item>
    ),
  },
  decorators: [
    (Story) => (
      <div className="s-w-[600px]">
        <Story />
      </div>
    ),
  ],
};

export const DefaultOpen: Story = {
  args: {
    defaultValue: "1",
    children: (
      <HorizontalCollapsible.Item value="1">
        <HorizontalCollapsible.Image
          src={SAMPLE_IMAGE}
          alt="Colorful gradient"
        />
        <div>
          <HorizontalCollapsible.Button>
            Already expanded
          </HorizontalCollapsible.Button>
          <HorizontalCollapsible.Panel>
            <p className="s-mt-2">
              This content is visible by default because we set defaultValue to
              "1".
            </p>
          </HorizontalCollapsible.Panel>
        </div>
      </HorizontalCollapsible.Item>
    ),
  },
  decorators: [
    (Story) => (
      <div className="s-w-[600px]">
        <Story />
      </div>
    ),
  ],
};

export const SecondaryVariant: Story = {
  args: {
    children: (
      <HorizontalCollapsible.Item value="1">
        <HorizontalCollapsible.Image
          src={SAMPLE_IMAGE}
          alt="Colorful gradient"
        />
        <div>
          <HorizontalCollapsible.Button variant="secondary">
            Secondary Button Style
          </HorizontalCollapsible.Button>
          <HorizontalCollapsible.Panel>
            <p className="s-mt-2">
              This example uses the secondary button variant for a different
              visual style.
            </p>
          </HorizontalCollapsible.Panel>
        </div>
      </HorizontalCollapsible.Item>
    ),
  },
  decorators: [
    (Story) => (
      <div className="s-w-[600px]">
        <Story />
      </div>
    ),
  ],
};

export const Disabled: Story = {
  args: {
    children: (
      <HorizontalCollapsible.Item value="1">
        <HorizontalCollapsible.Image
          src={SAMPLE_IMAGE}
          alt="Colorful gradient"
        />
        <div>
          <HorizontalCollapsible.Button disabled>
            Disabled State
          </HorizontalCollapsible.Button>
          <HorizontalCollapsible.Panel>
            <p className="s-mt-2">
              This content won't be accessible because the button is disabled.
            </p>
          </HorizontalCollapsible.Panel>
        </div>
      </HorizontalCollapsible.Item>
    ),
  },
  decorators: [
    (Story) => (
      <div className="s-w-[600px]">
        <Story />
      </div>
    ),
  ],
};

export const WithCustomImage: Story = {
  args: {
    children: (
      <HorizontalCollapsible.Item value="1">
        <HorizontalCollapsible.Image
          src={SAMPLE_IMAGE}
          alt="Colorful gradient"
          className="s-border-2 s-border-action-500"
        />
        <div>
          <HorizontalCollapsible.Button>
            Custom Image Styling
          </HorizontalCollapsible.Button>
          <HorizontalCollapsible.Panel>
            <p className="s-mt-2">
              This example shows how to apply custom styling to the image using
              the className prop.
            </p>
          </HorizontalCollapsible.Panel>
        </div>
      </HorizontalCollapsible.Item>
    ),
  },
  decorators: [
    (Story) => (
      <div className="s-w-[600px]">
        <Story />
      </div>
    ),
  ],
};

export const MultipleItems: Story = {
  render: function MultipleItemsStory() {
    return (
      <div className="s-w-[600px]">
        <HorizontalCollapsible defaultValue="1">
          <HorizontalCollapsible.Item value="1">
            <HorizontalCollapsible.Image
              src={SAMPLE_IMAGE}
              alt="Colorful gradient"
            />
            <div>
              <HorizontalCollapsible.Button>
                First Item
              </HorizontalCollapsible.Button>
              <HorizontalCollapsible.Panel>
                <p className="s-mt-2">Content for the first item.</p>
              </HorizontalCollapsible.Panel>
            </div>
          </HorizontalCollapsible.Item>

          <HorizontalCollapsible.Item value="2">
            <HorizontalCollapsible.Image
              src={SAMPLE_IMAGE}
              alt="Colorful gradient"
            />
            <div>
              <HorizontalCollapsible.Button>
                Second Item
              </HorizontalCollapsible.Button>
              <HorizontalCollapsible.Panel>
                <p className="s-mt-2">Content for the second item.</p>
              </HorizontalCollapsible.Panel>
            </div>
          </HorizontalCollapsible.Item>
        </HorizontalCollapsible>
      </div>
    );
  },
};
