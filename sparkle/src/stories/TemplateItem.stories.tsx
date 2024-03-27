import type { Meta } from "@storybook/react";
import React from "react";

import { TemplateItem } from "../index_with_tw_base";

const meta = {
  title: "Primitives/TemplateItem",
  component: TemplateItem,
} satisfies Meta<typeof TemplateItem>;

export default meta;

export const TemplateItemExample = () => (
  <div className="s-grid s-grid-cols-2 s-gap-4">
    <TemplateItem
      name="Hiring"
      id="1"
      description="The specialist for coverage, insurance, process related questions"
      visual={{ backgroundColor: "s-bg-red-100", emoji: "🫶" }}
      href={""}
    />

    <TemplateItem
      name="Training"
      id="2"
      description="The specialist for coverage, insurance, process related questions with a very long description that does not bring any value"
      visual={{ backgroundColor: "s-bg-blue-100", emoji: "🐴" }}
      href={""}
    />

    <TemplateItem
      name="Hiring"
      id="1"
      description="The specialist for coverage, insurance, process related questions"
      visual={{ backgroundColor: "s-bg-red-100", emoji: "🫶" }}
      href={""}
    />
  </div>
);
