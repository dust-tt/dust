import { PlusIcon } from "@heroicons/react/20/solid";
import { classNames } from "../../lib/utils";
import { Menu, Transition } from "@headlessui/react";
import { Fragment } from "react";

export default function NewBlock({ spec, disabled, onClick }) {
  let containsRoot = spec.filter((block) => block.type == "root").length > 0;
  let blocks = [
    { type: "data", display: ["data"] },
    { type: "llm", display: ["llm"] },
    { type: "code", display: ["code"] },
    { type: "map_reduce", display: ["map", "reduce"] },
  ];
  if (!containsRoot) {
    blocks.splice(0, 0, { type: "root", display: ["root"] });
  }

  return (
    <Menu as="div" className="relative inline-block text-left">
      <div>
        <Menu.Button
          className={classNames(
            "inline-flex items-center rounded-md border px-3 py-1 text-sm font-medium leading-6",
            disabled
              ? "bg-white text-gray-300"
              : "hover:bg-gray-800 bg-gray-700 text-white",
            "shadow-sm focus:outline-none focus:ring-2 focus:ring-0"
          )}
          disabled={disabled}
        >
          <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
          Block
        </Menu.Button>
      </div>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute shadow left-1 z-10 mt-1 w-32 origin-top-right rounded-md bg-white ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="py-1">
            {blocks.map((block) => (
              <Menu.Item
                key={block.type}
                onClick={() => {
                  if (onClick) {
                    onClick(block.type);
                  }
                }}
              >
                {({ active }) => (
                  <a
                    href="#"
                    className={classNames(
                      active ? "bg-gray-50 text-gray-900" : "text-gray-700",
                      "block px-4 py-2 text-sm"
                    )}
                  >
                    {block.display.map((d) => (
                      <span
                        key={d}
                        className="rounded-md px-1 py-0.5 bg-gray-200 font-bold mr-1"
                      >
                        {d}
                      </span>
                    ))}
                  </a>
                )}
              </Menu.Item>
            ))}
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
