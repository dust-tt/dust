import { Button, PriceTable, RocketIcon, SparklesIcon } from "@dust-tt/sparkle";
import { Tab } from "@headlessui/react";
import React from "react";

import { PRO_PLAN_SEAT_29_CODE } from "@app/lib/plans/plan_codes";
import { classNames } from "@app/lib/utils";
import { PlanType } from "@app/types/plan";

interface PricePlanProps {
  size: "sm" | "xs";
  className?: string;
  isTabs?: boolean;
  plan?: PlanType;
  onClickProPlan?: () => void;
  onClickEnterprisePlan?: () => void;
  isProcessing?: boolean;
}

function FreePriceTable({ size }: { size: "sm" | "xs" }) {
  return (
    <PriceTable
      title="Free"
      price="0€"
      priceLabel=""
      color="emerald"
      size={size}
      magnified={false}
    >
      <PriceTable.Item size={size} label="One user" variant="dash" />
      <PriceTable.Item size={size} label="One workspace" variant="dash" />
      <PriceTable.Item label="Privacy and Data Security" />
      <PriceTable.Item label="Advanced LLM models (GPT-4, Claude…)" />
      <PriceTable.Item label="Unlimited custom assistants" />
      <PriceTable.Item label="50 assistant messages" variant="dash" />
      <PriceTable.Item label="50 documents as data sources" variant="dash" />
      <PriceTable.Item label="No connections" variant="xmark" />
    </PriceTable>
  );
}

function ProPriceTable({
  size,
  plan,
  onClick,
  isProcessing,
}: {
  size: "sm" | "xs";
  plan?: PlanType;
  onClick?: () => void;
  isProcessing?: boolean;
}) {
  const biggerButtonSize = size === "xs" ? "sm" : "md";
  return (
    <PriceTable
      title="Pro"
      price="29€"
      color="sky"
      priceLabel="/ month / user"
      size={size}
      magnified={false}
    >
      <PriceTable.Item label="From 1 user" />
      <PriceTable.Item label="One workspace" variant="dash" />
      <PriceTable.Item label="Privacy and Data Security" />
      <PriceTable.Item label="Advanced LLM models (GPT-4, Claude…)" />
      <PriceTable.Item label="Unlimited custom assistants" />
      <PriceTable.Item label="Unlimited messages" />
      <PriceTable.Item label="Up to 1Go/user of data sources" />
      <PriceTable.Item
        label="Connections
  (GitHub, Google Drive, Notion, Slack)"
      />
      <PriceTable.Item label="Single Sign-on (Google, GitHub)" />
      <PriceTable.Item label="Dust Slackbot" />
      <PriceTable.Item label="Assistants can execute actions" />
      <PriceTable.Item label="Workspace role and permissions" variant="dash" />
      <PriceTable.ActionContainer>
        {plan && plan.code !== PRO_PLAN_SEAT_29_CODE && (
          <Button
            variant="primary"
            size={biggerButtonSize}
            label="Start now"
            icon={RocketIcon}
            disabled={isProcessing || plan.code === PRO_PLAN_SEAT_29_CODE}
            onClick={onClick}
          />
        )}
      </PriceTable.ActionContainer>
    </PriceTable>
  );
}
function EnterprisePriceTable({
  size,
  onClick,
  isProcessing,
}: {
  size: "sm" | "xs";
  onClick?: () => void;
  isProcessing?: boolean;
}) {
  const biggerButtonSize = size === "xs" ? "sm" : "md";
  return (
    <PriceTable title="Enterprise" price="Custom" size={size} magnified={false}>
      <PriceTable.Item label="From 100 users" />
      <PriceTable.Item label="Multiple workspaces" />
      <PriceTable.Item label="Privacy and Data Security" />
      <PriceTable.Item label="Advanced LLM models (GPT-4, Claude…)" />
      <PriceTable.Item label="Unlimited custom assistants" />
      <PriceTable.Item label="Unlimited messages" />
      <PriceTable.Item label="Unlimited data sources" />
      <PriceTable.Item
        label="Connections
  (GitHub, Google Drive, Notion, Slack…)"
      />
      <PriceTable.Item label="Single Sign-on" />
      <PriceTable.Item label="Dust Slackbot" />
      <PriceTable.Item label="Assistants can execute actions" />
      <PriceTable.Item label="Advanced workspace role and permissions" />
      <PriceTable.Item label="Dedicated account support" />
      <PriceTable.ActionContainer>
        {onClick && (
          <Button
            variant="primary"
            size={biggerButtonSize}
            label="Contact us"
            icon={SparklesIcon}
            disabled={isProcessing}
            onClick={onClick}
          />
        )}
      </PriceTable.ActionContainer>
    </PriceTable>
  );
}

export function PricePlans({
  size = "sm",
  isTabs = false,
  className = "",
  plan,
  onClickProPlan,
  onClickEnterprisePlan,
  isProcessing,
}: PricePlanProps) {
  if (isTabs) {
    return (
      <div
        className={classNames(
          "mx-0 sm:mx-24",
          "w-full max-w-md px-2 py-16 sm:px-0",
          className
        )}
      >
        <Tab.Group>
          <Tab.List className="flex space-x-1 rounded-full border border-slate-600/40 bg-slate-900/40 p-1 backdrop-blur">
            <Tab
              className={({ selected }) =>
                classNames(
                  "w-full rounded-full font-semibold transition-all duration-300 ease-out",
                  "py-2 text-sm",
                  "md:py-3 md:text-lg",
                  "ring-0 focus:outline-none",
                  selected
                    ? "bg-emerald-500 text-white shadow"
                    : "text-slate-300 hover:bg-white/[0.12] hover:text-white"
                )
              }
            >
              Free
            </Tab>
            <Tab
              className={({ selected }) =>
                classNames(
                  "w-full rounded-full font-semibold transition-all duration-300 ease-out",
                  "py-2 text-sm",
                  "md:py-3 md:text-lg",
                  "ring-0 focus:outline-none",
                  selected
                    ? "bg-sky-500 text-white shadow"
                    : "text-slate-300 hover:bg-white/[0.12] hover:text-white"
                )
              }
            >
              Pro
            </Tab>
            <Tab
              className={({ selected }) =>
                classNames(
                  "w-full rounded-full font-semibold transition-all duration-300 ease-out",
                  "py-2 text-sm",
                  "md:py-3 md:text-lg",
                  "ring-0 focus:outline-none",
                  selected
                    ? "bg-pink-500 text-white shadow"
                    : "text-slate-300 hover:bg-white/[0.12] hover:text-white"
                )
              }
            >
              Enterprise
            </Tab>
          </Tab.List>
          <Tab.Panels className="mt-8">
            <Tab.Panel>
              <FreePriceTable size={size} />
            </Tab.Panel>
            <Tab.Panel>
              <ProPriceTable
                size={size}
                plan={plan}
                isProcessing={isProcessing}
                onClick={onClickProPlan}
              />
            </Tab.Panel>
            <Tab.Panel>
              <EnterprisePriceTable
                size={size}
                isProcessing={isProcessing}
                onClick={onClickEnterprisePlan}
              />
            </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
      </div>
    );
  } else {
    return (
      <div
        className={classNames(
          "mx-4 flex flex-row md:-mx-12 md:gap-4 lg:gap-6 xl:mx-0 xl:gap-8 2xl:gap-10",
          className
        )}
      >
        <FreePriceTable size={size} />
        <ProPriceTable
          size={size}
          plan={plan}
          isProcessing={isProcessing}
          onClick={onClickProPlan}
        />
        <EnterprisePriceTable
          size={size}
          isProcessing={isProcessing}
          onClick={onClickEnterprisePlan}
        />
      </div>
    );
  }
}
