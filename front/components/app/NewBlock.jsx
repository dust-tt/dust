import { PlusIcon } from "@heroicons/react/20/solid";
import { classNames } from "../../lib/utils";
import { Popover, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { usePopper } from "react-popper";
import { useState } from "react";
import Image from "next/image";
import { getDisplayNameForBlock, getIconForBlock } from "../../lib/utils";

export default function NewBlock({ spec, disabled, onClick, direction }) {
  let [referenceElement, setReferenceElement] = useState();
  let [popperElement, setPopperElement] = useState();
  let { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: direction === "up" ? "top-end" : "bottom-end",
  });

  let containsInput = spec.filter((block) => block.type == "input").length > 0;
  let blocks = [
    {
      type: "llm",
      description:
        "Use an artificial intelligence Large Language Model to complete a prompt for you. Current LLMs supported: OpenAI's GPT-3 and Cohere.",
    },
    {
      type: "data",
      description:
        "Load a dataset to be used for every run of the Dust app. Typically used to seed a few-shot prompt to an LLM block.",
    },
    {
      type: "code",
      description:
        "Run a snippet of JavaScript to modify, augment, or combine results from other blocks.",
    },
    {
      type: "search",
      description:
        "Issue a query to Google so you can feed the results to other blocks.",
    },
    {
      type: "map_reduce",
      description:
        "Loop over multiple runs of this Dust app and combine them into one result.",
    },
  ];
  if (!containsInput) {
    blocks.splice(0, 0, {
      type: "input",
      description:
        "Select a dataset that is used as the input to this Dust app, like the arguments to a function. Each element in the dataset kicks off a separate parallel run of the Dust app.",
      display: ["input"],
    });
  }

  return (
    <Popover>
      <Popover.Button
        ref={setReferenceElement}
        className={classNames(
          "inline-flex items-center rounded-md border px-3 py-1 text-sm font-medium leading-6",
          disabled
            ? "border-gray-200 bg-white text-gray-300"
            : "border-gray-700 hover:bg-gray-800 bg-gray-700 text-white",
          "shadow-sm focus:outline-none focus:ring-2 focus:ring-0"
        )}
      >
        <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
        Block
      </Popover.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Popover.Panel
          ref={setPopperElement}
          style={styles.popper}
          {...attributes.popper}
          className={classNames(
            "absolute shadow left-1 z-10 mt-1  origin-top-right rounded-md bg-white ring-1 ring-black ring-opacity-5 focus:outline-none",
            direction === "up" ? "bottom-10" : ""
          )}
        >
          {blocks.map((block) => (
            <Popover.Button
              as="div"
              key={block.type}
              onClick={() => {
                if (onClick) {
                  onClick(block.type);
                }
              }}
              className="flex flex-row flex-nowrap gap-4 bg-white p-4 hover:bg-gray-100 cursor-pointer"
            >
              <div className="flex-none h-10 w-10 shrink-0 items-center justify-center sm:h-12 sm:w-12">
                <Image
                  src={getIconForBlock(block.type)}
                  width="48"
                  height="48"
                />
              </div>
              <div className="ml-4 max-w-lg">
                <p className="text-base font-medium text-gray-900">
                  {getDisplayNameForBlock(block.type)}
                </p>
                <p className="text-sm text-gray-500">{block.description}</p>
              </div>
            </Popover.Button>
          ))}
        </Popover.Panel>
      </Transition>
    </Popover>
  );
}
