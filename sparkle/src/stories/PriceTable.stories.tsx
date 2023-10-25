import type { Meta } from "@storybook/react";
import React from "react";

import { Button, PriceTable } from "../index_with_tw_base";

const meta = {
  title: "Molecule/PriceTable",
  component: PriceTable,
} satisfies Meta<typeof PriceTable>;

export default meta;

export const PricingXS = () => {
  return (
    <div className="s-h-full s-w-full">
      <PriceTable.Container>
        <PriceTable
          title="Test"
          price="0€"
          priceLabel="/ month"
          color="emerald"
        >
          <PriceTable.Item label="Single member / workspace" variant="dash" />
          <PriceTable.Item label="Unlimited custom assistants" />
          <PriceTable.Item label="Advanced LLM models (gpt4, Claude, ...)" />
          <PriceTable.Item label="20 messages a week" variant="dash" />
          <PriceTable.Item label="Static Data Sources (35Mo)" variant="dash" />
          <PriceTable.Item label="Connected Data Sources" variant="xmark" />
          <PriceTable.ActionContainer>
            <div className="s-h-9 s-text-base s-font-bold s-text-element-600">
              Your current plan
            </div>
          </PriceTable.ActionContainer>
        </PriceTable>
        <PriceTable
          title="Business"
          price="0€"
          color="sky"
          priceLabel="/ month / seat"
        >
          <PriceTable.Item label="Unlimited members / workspace" />
          <PriceTable.Item label="Unlimited custom assistants" />
          <PriceTable.Item label="Advanced LLM models (gpt4, Claude, ...)" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.ActionContainer>
            <Button size="sm" variant="primary" label="Select this plan" />
          </PriceTable.ActionContainer>
        </PriceTable>
        <PriceTable title="Enterprise" price="Custom">
          <PriceTable.Item label="Unlimited members / workspace" />
          <PriceTable.Item label="Unlimited workspaces" />
          <PriceTable.Item label="Unlimited custom assistants" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.ActionContainer>
            <Button size="sm" variant="secondary" label="Contact us" />
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
          title="Test"
          price="0€"
          priceLabel="/ month"
          color="emerald"
          size="sm"
        >
          <PriceTable.Item label="Single member / workspace" variant="dash" />
          <PriceTable.Item label="Unlimited custom assistants" />
          <PriceTable.Item label="Advanced LLM models (gpt4, Claude, ...)" />
          <PriceTable.Item label="20 messages a week" variant="dash" />
          <PriceTable.Item label="Static Data Sources (35Mo)" variant="dash" />
          <PriceTable.Item label="Connected Data Sources" variant="xmark" />
          <PriceTable.ActionContainer>
            <div className="s-h-9 s-text-base s-font-bold s-text-element-600">
              Your current plan
            </div>
          </PriceTable.ActionContainer>
        </PriceTable>
        <PriceTable
          title="Business"
          price="0€"
          color="sky"
          priceLabel="/ month / seat"
          size="sm"
        >
          <PriceTable.Item label="Unlimited members / workspace" />
          <PriceTable.Item label="Unlimited custom assistants" />
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
          <PriceTable.Item label="Unlimited members / workspace" />
          <PriceTable.Item label="Unlimited workspaces" />
          <PriceTable.Item label="Unlimited custom assistants" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.Item label="1 user" />
          <PriceTable.ActionContainer>
            <Button size="md" variant="secondary" label="Contact us" />
          </PriceTable.ActionContainer>
        </PriceTable>
      </PriceTable.Container>
    </div>
  );
};
