import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PlusIcon,
  ScrollArea,
} from "@dust-tt/sparkle";

import { classNames } from "@app/lib/utils";
import type { BlockType, SpecificationType } from "@app/types";

export default function NewBlock({
  spec,
  disabled,
  onClick,
  small,
}: {
  spec: SpecificationType;
  disabled: boolean;
  onClick: (type: BlockType | "map_reduce" | "while_end") => void;
  small: boolean;
}) {
  const containsInput =
    spec.filter((block) => block.type == "input").length > 0;
  const blocks: {
    type: BlockType | "map_reduce" | "while_end";
    typeNames: BlockType[];
    name: string;
    description: string;
  }[] = [
    {
      type: "chat",
      typeNames: ["chat"],
      name: "Interact with a Large Language Model (LLM)",
      description:
        "Query a Large Language Model using a message-based interface.",
    },
    {
      type: "data",
      typeNames: ["data"],
      name: "Data array",
      description:
        "Load a dataset and output its elements as an array. Typically used to seed few-shot prompts.",
    },
    {
      type: "code",
      typeNames: ["code"],
      name: "Run Javascript",
      description:
        "Run a snippet of JavaScript to modify, augment, or combine results from other blocks.",
    },
    {
      type: "data_source",
      typeNames: ["data_source"],
      name: "Search a datasource",
      description:
        "Perform semantic search against chunked documents from a DataSource.",
    },
    {
      type: "curl",
      typeNames: ["curl"],
      name: "cURL Request",
      description:
        "Perform an HTTP request to interface with external services.",
    },
    {
      type: "browser",
      typeNames: ["browser"],
      name: "Extract website data",
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
      name: "Map Reduce loop",
      description:
        "Map over an array and execute a sequence of blocks in parallel.",
    },
    {
      type: "while_end",
      typeNames: ["while", "end"],
      name: "While loop",
      description: "Loop over a set of blocks until a condition is met.",
    },
    {
      type: "database_schema",
      typeNames: ["database_schema"],
      name: "Retrieve a database schema",
      description: "Retrieve the schema of a database.",
    },
    {
      type: "database",
      typeNames: ["database"],
      name: "Query a database",
      description:
        "Query a database by executing SQL queries on structured data sources.",
    },
  ];

  blocks.sort((a, b) =>
    a.type.toLowerCase().localeCompare(b.type.toLowerCase())
  );

  // Add input block on top if it doesn't exist.
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {small ? (
          <Button
            icon={PlusIcon}
            disabled={disabled}
            variant="ghost-secondary"
            size="mini"
          />
        ) : (
          <Button
            variant="ghost-secondary"
            label="Add Block"
            icon={PlusIcon}
            disabled={disabled}
          />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className={classNames("my-2 block w-max", small ? "-right-16" : "")}
      >
        <ScrollArea className="h-[400px]">
          <div className="p-1">
            {blocks.map((block) => (
              <DropdownMenuItem
                key={block.type}
                onClick={() => onClick(block.type)}
              >
                <div className="grid max-w-md grid-cols-12 items-center">
                  <div className="col-span-4 sm:col-span-3">
                    <div className="flex text-base font-medium text-foreground dark:text-foreground-night">
                      <div
                        className={cn(
                          "mr-1 rounded-xl px-1 py-0.5 text-sm font-bold",
                          block.type === "input"
                            ? "bg-orange-200 dark:bg-orange-200-night"
                            : "bg-primary-200 dark:bg-primary-200-night"
                        )}
                      >
                        {block.type}
                      </div>
                    </div>
                  </div>
                  <div className="text-text-muted-foreground dark:text-text-muted-foreground-night col-span-8 pr-2 text-sm sm:col-span-9 sm:pl-6">
                    <strong>{block.name}</strong>
                    <br />
                    <p className="text-sm">{block.description}</p>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
