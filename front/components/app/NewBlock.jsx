import { PlusIcon } from "@heroicons/react/20/solid";
import { classNames } from "../../lib/utils";
import { Menu } from "@headlessui/react";

export default function NewBlock({
  spec,
  disabled,
  onClick,
  direction,
  small,
}) {
  let containsInput = spec.filter((block) => block.type == "input").length > 0;
  let blocks = [
    {
      type: "llm",
      typeNames: ["llm"],
      name: "Large Language Model (LLM)",
      description: "Query a Large Language Model to complete a prompt for you.",
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
  ];
  if (!containsInput) {
    blocks.splice(0, 0, {
      type: "input",
      typeNames: ["input"],
      name: "Input",
      description:
        "Select a dataset of inputs used for the design your Dust app. Each element in the dataset kicks off a separate parallel execution of the Dust app.",
      display: ["input"],
    });
  }

  return (
    <Menu as="div" className="relative inline-block">
      <div>
        {small ? (
          <Menu.Button
            className={classNames(
              "inline-flex items-center text-sm font-medium leading-6 bg-transparent text-gray-400 border-1 border-red-200 px-0 py-0",
              disabled ? "text-gray-300" : "hover:text-gray-700",
              "focus:outline-none focus:ring-0"
            )}
            disabled={disabled}
          >
            <PlusIcon className="h-4 w-4" />
          </Menu.Button>
        ) : (
          <Menu.Button
            className={classNames(
              "inline-flex items-center rounded-md border px-3 py-1 text-sm font-medium leading-6",
              disabled
                ? "border-gray-200 bg-white text-gray-300"
                : "border-gray-700 hover:bg-gray-800 bg-gray-700 text-white",
              "shadow-sm focus:outline-none focus:ring-2 focus:ring-0"
            )}
            disabled={disabled}
          >
            <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
            Block
          </Menu.Button>
        )}
      </div>
      <Menu.Items
        className={classNames(
          "absolute w-96 block shadow z-10 my-2 rounded-md bg-white ring-1 ring-black ring-opacity-5 focus:outline-none",
          small ? "-right-16" : "-left-1",
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
            className="flex flex-row my-1 flex-nowrap gap-4 bg-white py-1 px-0 hover:bg-gray-100 hover:text-gray-500 text-gray-400 cursor-pointer"
          >
            {({ active }) => (
              <div className="grid grid-cols-12 ml-4 max-w-md items-center">
                <div className="col-span-4 sm:col-span-3">
                  <div className="flex text-base font-medium text-gray-900">
                    {block.typeNames.map((type) => (
                      <div
                        key={type}
                        className="rounded-md px-1 py-0.5 bg-gray-200 text-sm font-bold mr-1"
                      >
                        {type}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-span-8 sm:col-span-9 text-sm sm:pl-3 pr-2">
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
