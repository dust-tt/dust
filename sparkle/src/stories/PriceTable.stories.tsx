import type { Meta } from "@storybook/react";
import React from "react";

import { Button, Hoverable, PriceTable } from "../index_with_tw_base";

const meta = {
  title: "Components/PriceTable",
  component: PriceTable,
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
