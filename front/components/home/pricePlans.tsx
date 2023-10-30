import {
  Button,
  LightbulbIcon,
  PriceTable,
  RocketIcon,
  SparklesIcon,
} from "@dust-tt/sparkle";
import { Tab } from "@headlessui/react";
import React from "react";

import { classNames } from "@app/lib/utils";

interface PricePlanProps {
  size?: "sm" | "xs";
  className?: string;
  isTabs?: boolean;
}

export const PricePlans = ({
  size = "sm",
  isTabs = false,
  className = "",
}: PricePlanProps) => {
  const FreePriceTable = (size: "sm" | "xs") => (
    <PriceTable
      title="Free"
      price="$0"
      priceLabel=""
      color="emerald"
      size={size}
      magnified={false}
    >
      <PriceTable.Item label="One user" variant="dash" />
      <PriceTable.Item label="One workspace" variant="dash" />
      <PriceTable.Item label="Privacy and Data Security" />
      <PriceTable.Item label="Advanced LLM models (GPT-4, Claude…)" />
      <PriceTable.Item label="Unlimited custom assistants" />
      <PriceTable.Item label="100 assistant messages" variant="dash" />
      <PriceTable.Item label="50 documents as data sources" variant="dash" />
      <PriceTable.Item label="No connections" variant="xmark" />
      <PriceTable.ActionContainer>
        <Button
          variant="primary"
          size={size == "sm" ? "lg" : "md"}
          label="Start testing"
          icon={LightbulbIcon}
        />
      </PriceTable.ActionContainer>
    </PriceTable>
  );

  const ProPriceTable = (size: "sm" | "xs") => (
    <PriceTable
      title="Pro"
      price="$29"
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
        <Button
          variant="primary"
          size={size == "sm" ? "lg" : "md"}
          label="Start now"
          icon={RocketIcon}
        />
      </PriceTable.ActionContainer>
    </PriceTable>
  );

  const EnterprisePriceTable = (size: "sm" | "xs") => (
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
        <Button
          variant="primary"
          size={size == "sm" ? "lg" : "md"}
          label="Contact us"
          icon={SparklesIcon}
        />
      </PriceTable.ActionContainer>
    </PriceTable>
  );
  if (isTabs) {
    return (
      <div
        className={classNames(
          "mx-8 sm:mx-24",
          "w-full max-w-md px-2 py-16 sm:px-0",
          className
        )}
      >
        <Tab.Group>
          <Tab.List className="flex space-x-1 rounded-xl border border-slate-600/40 bg-slate-900/40 p-1 backdrop-blur">
            <Tab
              className={({ selected }) =>
                classNames(
                  "w-full rounded-lg py-3 text-lg font-semibold transition-all duration-300 ease-out",
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
                  "w-full rounded-lg py-3 text-lg font-semibold transition-all duration-300 ease-out",
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
                  "w-full rounded-lg py-3 text-lg font-semibold transition-all duration-300 ease-out",
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
            <Tab.Panel>{FreePriceTable("sm")}</Tab.Panel>
            <Tab.Panel>{ProPriceTable("sm")}</Tab.Panel>
            <Tab.Panel>{EnterprisePriceTable("sm")}</Tab.Panel>
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
        {FreePriceTable(size)}
        {ProPriceTable(size)}
        {EnterprisePriceTable(size)}
      </div>
    );
  }
};
