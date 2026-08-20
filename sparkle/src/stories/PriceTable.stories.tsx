import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import { Button, Hoverable, PriceTable } from "../index_with_tw_base";

const meta = {
  title: "Data Display/PriceTable",
  tags: ["a11y-issues"],
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

const onFairUseClick = fn();

/**
 * Two plans side by side in a **PriceTable.Container**, at the default
 * compact (`xs`) size: a priced Pro tier with an accent color and a
 * contact-us Enterprise tier. Item labels accept rich content — the Pro
 * plan's first row embeds a **Hoverable** footnote link.
 * @summary Two pricing tiers side by side.
 */
export const PricingPlans: StoryObj = {
  render: () => (
    <div className="h-full w-full">
      <PriceTable.Container>
        <PriceTable
          title="Pro"
          price="29€"
          color="sky"
          priceLabel="/ month / seat"
        >
          <PriceTable.ActionContainer position="top">
            <Button size="sm" variant="primary" label="Start now" />
          </PriceTable.ActionContainer>
          <PriceTable.Item
            label={
              <>
                Unlimited messages
                <br />
                <Hoverable onClick={onFairUseClick}>
                  Fair use policy applies
                </Hoverable>
              </>
            }
          />
          <PriceTable.Item label="Unlimited custom agents" />
          <PriceTable.Item label="Advanced models (GPT-4, Claude, ...)" />
          <PriceTable.Item label="Unlimited data sources" />
          <PriceTable.Item label="Priority email support" />
          <PriceTable.ActionContainer>
            <Button size="sm" variant="primary" label="Start now" />
          </PriceTable.ActionContainer>
        </PriceTable>
        <PriceTable title="Enterprise" price="Custom">
          <PriceTable.ActionContainer position="top">
            <Button size="sm" variant="primary" label="Contact us" />
          </PriceTable.ActionContainer>
          <PriceTable.Item label="Everything in Pro" />
          <PriceTable.Item label="Unlimited workspaces" />
          <PriceTable.Item label="Single sign-on (SSO / SAML)" />
          <PriceTable.Item label="Advanced security controls" />
          <PriceTable.Item label="Dedicated account manager" />
          <PriceTable.ActionContainer>
            <Button size="sm" variant="primary" label="Contact us" />
          </PriceTable.ActionContainer>
        </PriceTable>
      </PriceTable.Container>
    </div>
  ),
};

/**
 * The `size="sm"` variant renders the same card at a larger, standalone
 * density (bigger padding and shadow) for full pricing pages; the default
 * `xs` size is the compact one shown in PricingPlans.
 * @summary Larger sm density for full pricing pages.
 */
export const LargeSize: StoryObj = {
  render: () => (
    <div className="h-full w-full">
      <PriceTable.Container>
        <PriceTable
          title="Pro"
          price="29€"
          color="sky"
          priceLabel="/ month / seat"
          size="sm"
        >
          <PriceTable.ActionContainer position="top">
            <Button size="md" variant="primary" label="Select this plan" />
          </PriceTable.ActionContainer>
          <PriceTable.Item label="Unlimited messages" />
          <PriceTable.Item label="Unlimited custom agents" />
          <PriceTable.Item label="Advanced models (GPT-4, Claude, ...)" />
          <PriceTable.Item label="Priority email support" />
          <PriceTable.ActionContainer>
            <Button size="md" variant="primary" label="Select this plan" />
          </PriceTable.ActionContainer>
        </PriceTable>
        <PriceTable title="Enterprise" price="Custom" size="sm">
          <PriceTable.ActionContainer position="top">
            <Button size="md" variant="primary" label="Contact us" />
          </PriceTable.ActionContainer>
          <PriceTable.Item label="Everything in Pro" />
          <PriceTable.Item label="Unlimited workspaces" />
          <PriceTable.Item label="Single sign-on (SSO / SAML)" />
          <PriceTable.Item label="Dedicated account manager" />
          <PriceTable.ActionContainer>
            <Button size="md" variant="primary" label="Contact us" />
          </PriceTable.ActionContainer>
        </PriceTable>
      </PriceTable.Container>
    </div>
  ),
};
