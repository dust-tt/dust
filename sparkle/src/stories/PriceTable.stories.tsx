import type { Meta } from "@storybook/react";
import React from "react";

import { Button, Hoverable, PriceTable } from "../index_with_tw_base";

const meta = {
  title: "Data Display/PriceTable",
  component: PriceTable,
  parameters: {
    docs: {
      description: {
        component: `A pricing plan card showing a **title**, **price**, optional **priceLabel**, and an accent **color**, with a list of **PriceTable.Item** rows and one or more **PriceTable.ActionContainer** slots (positionable at \`top\` or bottom). Lay several plans side by side with **PriceTable.Container**, and use \`size\` to switch between compact and standard density.

**When to use**
- On pricing or plan-selection pages to compare tiers.

**Guidelines**
- Wrap multiple plans in **PriceTable.Container** so they align and size consistently.
- Place the primary CTA in a **PriceTable.ActionContainer**; use \`position="top"\` to repeat it above the feature list.`,
      },
    },
  },
} satisfies Meta<typeof PriceTable>;

export default meta;

export const PricingXS = () => {
  return (
    <div className="s-h-full s-w-full">
      <PriceTable.Container>
        <PriceTable
          title="Business"
          price="0€"
          color="emerald"
          priceLabel="/ month / seat"
        >
          <PriceTable.ActionContainer position="top">
            <Button size="sm" variant="primary" label="Start Now" />
          </PriceTable.ActionContainer>
          <PriceTable.Item
            label={
              <>
                "Unlimited members / workspace"
                <br />
                <Hoverable
                  onClick={() => {
                    alert("Clicked!");
                  }}
                >
                  hello
                </Hoverable>
              </>
            }
          />
          <PriceTable.Item label="Unlimited custom agents" />
          <PriceTable.Item label="Advanced LLM models (gpt4, Claude, ...)" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.ActionContainer>
            <Button size="sm" variant="primary" label="Start Now" />
          </PriceTable.ActionContainer>
        </PriceTable>
        <PriceTable title="Enterprise" price="Custom">
          <PriceTable.ActionContainer position="top">
            <Button size="sm" variant="primary" label="Start Now" />
          </PriceTable.ActionContainer>
          <PriceTable.Item label="Unlimited members / workspace" />
          <PriceTable.Item label="Unlimited workspaces" />
          <PriceTable.Item label="Unlimited custom agents" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.ActionContainer>
            <Button size="sm" variant="primary" label="Contact us" />
          </PriceTable.ActionContainer>
        </PriceTable>
      </PriceTable.Container>
    </div>
  );
};

export const PricingSM = () => {
  return (
    <div className="s-h-full s-w-full">
      <PriceTable.Container>
        <PriceTable
          title="pro"
          price="29€"
          color="sky"
          priceLabel="/ month / seat"
          size="sm"
        >
          <PriceTable.ActionContainer position="top">
            <Button size="md" variant="primary" label="Select this plan" />
          </PriceTable.ActionContainer>
          <PriceTable.Item label="Unlimited members / workspace" />
          <PriceTable.Item label="Unlimited custom agents" />
          <PriceTable.Item label="Advanced LLM models (gpt4, Claude, ...)" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.ActionContainer>
            <Button size="md" variant="primary" label="Select this plan" />
          </PriceTable.ActionContainer>
        </PriceTable>
        <PriceTable title="Enterprise" price="Custom" size="sm">
          <PriceTable.ActionContainer position="top">
            <Button size="md" variant="primary" label="Contact us" />
          </PriceTable.ActionContainer>
          <PriceTable.Item label="Unlimited members / workspace" />
          <PriceTable.Item label="Unlimited workspaces" />
          <PriceTable.Item label="Unlimited custom agents" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.ActionContainer>
            <Button size="md" variant="primary" label="Contact us" />
          </PriceTable.ActionContainer>
        </PriceTable>
      </PriceTable.Container>
    </div>
  );
};
