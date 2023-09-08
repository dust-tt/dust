import { Button } from "@dust-tt/sparkle";
import { Menu } from "@headlessui/react";
import { PlusIcon } from "@heroicons/react/20/solid";

import { classNames } from "@app/lib/utils";
import { SpecificationType } from "@app/types/app";
import { BlockType } from "@app/types/run";

export default function NewBlock({
  spec,
  disabled,
  onClick,
  direction,
  small,
}: {
  spec: SpecificationType;
  disabled: boolean;
  onClick: (type: BlockType | "map_reduce" | "while_end") => void;
  direction: "up" | "down";
  small: boolean;
}) {
  const containsInput =
    spec.filter((block) => block.type == "input").length > 0;
  const blocks = [
    {
      type: "llm",
      typeNames: ["llm"],
      name: "Large Language Model (LLM)",
      description: "Query a Large Language Model to complete a prompt for you.",
    },
    {
      type: "chat",
      typeNames: ["chat"],
      name: "Chat-based Large Language Model",
      description:
        "Query a Large Language Model using a message-based interface.",
    },
    {
      type: "data",
      typeNames: ["data"],
      name: "Data",
      description:
        "Load a dataset and output its elements as an array. Typically used to seed few-shot prompts.",
    },
    {
      type: "code",
      typeNames: ["code"],
      name: "JavaScript",
      description:
        "Run a snippet of JavaScript to modify, augment, or combine results from other blocks.",
    },
    {
      type: "data_source",
      typeNames: ["data_source"],
      name: "DataSource",
      description:
        "Perform semantic search against chunked documents from a DataSource.",
    },
    {
      type: "curl",
      typeNames: ["curl"],
      name: "Curl Request",
      description:
        "Perform an HTTP request to interface with external services.",
    },
    {
      type: "browser",
      typeNames: ["browser"],
      name: "Browser",
      description:
        "Download the HTML or text content of page on the web (or a portion of it).",
    },
    {
      type: "search",
      typeNames: ["search"],
      name: "Google Search",
      description:
        "Issue a query to Google so you can feed the results to other blocks.",
    },
    {
      type: "map_reduce",
      typeNames: ["map", "reduce"],
      name: "Map Reduce",
      description:
        "Map over an array and execute a sequence of blocks in parallel.",
    },
    {
      type: "while_end",
      typeNames: ["while", "end"],
      name: "While End",
      description: "Loop over a set of blocks until a condition is met.",
    },
  ] as {
    type: BlockType | "map_reduce" | "while_end";
    typeNames: BlockType[];
    name: string;
    description: string;
  }[];

  if (!containsInput) {
    blocks.splice(0, 0, {
      type: "input",
      typeNames: ["input"],
      name: "Input",
      description:
        "Select a dataset of inputs used for the design your Dust app. Each element in the dataset kicks off a separate parallel execution of the Dust app.",
    });
  }

  return (
    <Menu as="div" className="relative inline-block">
      <div>
        {small ? (
          <Menu.Button
            className={classNames(
              "border-1 inline-flex items-center border-red-200 bg-transparent px-0 py-0 text-sm font-medium leading-6 text-gray-400",
              disabled ? "text-gray-300" : "hover:text-gray-700",
              "focus:outline-none focus:ring-0"
            )}
            disabled={disabled}
          >
            <PlusIcon className="h-4 w-4" />
          </Menu.Button>
        ) : (
          <Menu.Button as="div" disabled={disabled}>
            <Button
              variant="secondary"
              label="Add Block"
              icon={PlusIcon}
              disabled={disabled}
            />
          </Menu.Button>
        )}
      </div>
      <Menu.Items
        className={classNames(
          "absolute z-10 my-2 block w-max rounded-md bg-white shadow ring-1 ring-black ring-opacity-5 focus:outline-none",
          small ? "-right-16" : "",
          direction === "up" ? "bottom-9" : ""
        )}
      >
        {blocks.map((block) => (
          <Menu.Item
            as="div"
            key={block.type}
            onClick={() => {
              if (onClick) {
                onClick(block.type);
              }
            }}
            className="my-1 flex cursor-pointer flex-row flex-nowrap gap-4 bg-white px-0 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
          >
            {() => (
              <div className="ml-4 grid max-w-md grid-cols-12 items-center">
                <div className="col-span-4 sm:col-span-3">
                  <div className="flex text-base font-medium text-gray-900">
                    {block.typeNames.map((type) => (
                      <div
                        key={type}
                        className="mr-1 rounded-md bg-gray-200 px-1 py-0.5 text-sm font-bold"
                      >
                        {type}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-span-8 pr-2 text-sm text-gray-700 sm:col-span-9 sm:pl-3">
                  {block.description}
                </div>
              </div>
            )}
          </Menu.Item>
        ))}
      </Menu.Items>
    </Menu>
  );
}
