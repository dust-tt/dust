import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { HorizontalCollapsible } from "../components/HorizontalCollapsible";

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

export const LeftAligned: Story = {
  render: function MultipleItemsStory() {
    return (
      <div className="s-w-[600px]">
        <HorizontalCollapsible defaultValue="1">
          <HorizontalCollapsible.Content>
            <HorizontalCollapsible.Item value="1">
              <HorizontalCollapsible.Button>
                First Item
              </HorizontalCollapsible.Button>
              <HorizontalCollapsible.Panel>
                <p className="s-mt-2">Content for the first item.</p>
              </HorizontalCollapsible.Panel>
            </HorizontalCollapsible.Item>

            <HorizontalCollapsible.Item value="2">
              <HorizontalCollapsible.Button>
                Second Item
              </HorizontalCollapsible.Button>
              <HorizontalCollapsible.Panel>
                <p className="s-mt-2">Content for the second item.</p>
              </HorizontalCollapsible.Panel>
            </HorizontalCollapsible.Item>
          </HorizontalCollapsible.Content>
          <HorizontalCollapsible.ImageContainer>
            <HorizontalCollapsible.Image
              src={SAMPLE_IMAGE}
              alt="First gradient"
              value="1"
            />
            <HorizontalCollapsible.Image
              src="https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=400&h=300&fit=crop"
              alt="Second gradient"
              value="2"
            />
          </HorizontalCollapsible.ImageContainer>
        </HorizontalCollapsible>
      </div>
    );
  },
};
export const RightAligned: Story = {
  render: function MultipleItemsStory() {
    return (
      <div className="s-w-[600px]">
        <HorizontalCollapsible defaultValue="1">
          <HorizontalCollapsible.ImageContainer>
            <HorizontalCollapsible.Image
              src={SAMPLE_IMAGE}
              alt="First gradient"
              value="1"
            />
            <HorizontalCollapsible.Image
              src="https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=400&h=300&fit=crop"
              alt="Second gradient"
              value="2"
            />
          </HorizontalCollapsible.ImageContainer>

          <HorizontalCollapsible.Content>
            <HorizontalCollapsible.Item value="1">
              <HorizontalCollapsible.Button>
                First Item
              </HorizontalCollapsible.Button>
              <HorizontalCollapsible.Panel>
                <p className="s-mt-2">Content for the first item.</p>
              </HorizontalCollapsible.Panel>
            </HorizontalCollapsible.Item>

            <HorizontalCollapsible.Item value="2">
              <HorizontalCollapsible.Button>
                Second Item
              </HorizontalCollapsible.Button>
              <HorizontalCollapsible.Panel>
                <p className="s-mt-2">Content for the second item.</p>
              </HorizontalCollapsible.Panel>
            </HorizontalCollapsible.Item>
          </HorizontalCollapsible.Content>
        </HorizontalCollapsible>
      </div>
    );
  },
};
