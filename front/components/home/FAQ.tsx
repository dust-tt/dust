import { DashIcon, PlusIcon, Separator } from "@dust-tt/sparkle";
import React, { useState } from "react";

import { H2 } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export interface FAQItem {
  question: string;
  answer: React.ReactNode; // Now accepts React components, JSX, or strings
}

interface FAQProps {
  title?: string;
  items: FAQItem[];
  className?: string;
}

const FAQItemComponent: React.FC<{
  item: FAQItem;
  defaultOpen?: boolean;
}> = ({ item, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="w-full">
      <button
        className="flex w-full items-center justify-between py-6 text-left focus:outline-none"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="text-lg font-medium text-foreground dark:text-foreground-night">
          {item.question}
        </span>
        <span
          className={`ml-6 flex h-6 w-6 flex-shrink-0 items-center justify-center text-muted-foreground transition-transform duration-200 dark:text-muted-foreground-night ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
        >
          {isOpen ? (
            <DashIcon className="h-5 w-5" />
          ) : (
            <PlusIcon className="h-5 w-5" />
          )}
        </span>
      </button>
      <div
        className={`grid overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="pb-6">
            <div className="prose prose-gray max-w-none text-base leading-relaxed text-gray-600 dark:text-gray-400 [&>h3]:mb-2 [&>h3]:mt-3 [&>h3]:text-lg [&>h3]:font-semibold [&>h3]:text-gray-800 [&>h3]:dark:text-gray-200 [&>li]:mb-1 [&>strong]:font-semibold [&>strong]:text-gray-700 [&>strong]:dark:text-gray-300 [&>ul]:mb-4 [&>ul]:list-disc [&>ul]:pl-6">
              {item.answer}
            </div>
          </div>
        </div>
      </div>
      <Separator className="my-0" />
    </div>
  );
};

export const FAQ: React.FC<FAQProps> = ({
  title = "FAQ",
  items,
  className,
}) => {
  return (
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    <div className={classNames("w-full", className || "")}>
      <div className="w-full">
        <H2 className="mb-12 text-left text-foreground dark:text-foreground-night">
          {title}
        </H2>
        <div className="w-full">
          {items.map((item, index) => (
            <FAQItemComponent
              key={index}
              item={item}
              defaultOpen={false} // All items closed by default
            />
          ))}
        </div>
      </div>
    </div>
  );
};
