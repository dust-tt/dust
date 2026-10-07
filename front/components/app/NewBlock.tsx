import { compareStrings } from "@app/lib/i18n/format";
import { classNames } from "@app/lib/utils";
import type { SpecificationType } from "@app/types/app";
import type { BlockType } from "@app/types/run";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Plus,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
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
      name: t`Interact with a Large Language Model (LLM)`,
      description: t`Query a Large Language Model using a message-based interface.`,
    },
    {
      type: "data",
      typeNames: ["data"],
      name: t`Data array`,
      description: t`Load a dataset and output its elements as an array. Typically used to seed few-shot prompts.`,
    },
    {
      type: "code",
      typeNames: ["code"],
      name: t`Run Javascript`,
      description: t`Run a snippet of JavaScript to modify, augment, or combine results from other blocks.`,
    },
    {
      type: "data_source",
      typeNames: ["data_source"],
      name: t`Search a datasource`,
      description: t`Perform semantic search against chunked documents from a DataSource.`,
    },
    {
      type: "curl",
      typeNames: ["curl"],
      name: t`cURL Request`,
      description: t`Perform an HTTP request to interface with external services.`,
    },
    {
      type: "browser",
      typeNames: ["browser"],
      name: t`Extract website data`,
      description: t`Download the HTML or text content of page on the web (or a portion of it).`,
    },
    {
      type: "search",
      typeNames: ["search"],
      name: t`Google Search`,
      description: t`Issue a query to Google so you can feed the results to other blocks.`,
    },
    {
      type: "map_reduce",
      typeNames: ["map", "reduce"],
      name: t`Map Reduce loop`,
      description: t`Map over an array and execute a sequence of blocks in parallel.`,
    },
    {
      type: "while_end",
      typeNames: ["while", "end"],
      name: t`While loop`,
      description: t`Loop over a set of blocks until a condition is met.`,
    },
    {
      type: "database_schema",
      typeNames: ["database_schema"],
      name: t`Retrieve a database schema`,
      description: t`Retrieve the schema of a database.`,
    },
    {
      type: "database",
      typeNames: ["database"],
      name: t`Query a database`,
      description: t`Query a database by executing SQL queries on structured data sources.`,
    },
  ];

  blocks.sort((a, b) =>
    compareStrings(a.type.toLowerCase(), b.type.toLowerCase())
  );

  // Add input block on top if it doesn't exist.
  if (!containsInput) {
    blocks.splice(0, 0, {
      type: "input",
      typeNames: ["input"],
      name: t({ message: "Input", context: "Dust app block name" }),
      description: t`Select a dataset of inputs used for the design your Dust app. Each element in the dataset kicks off a separate parallel execution of the Dust app.`,
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {small ? (
          <Button
            icon={Plus}
            disabled={disabled}
            variant="ghost-secondary"
            size="icon"
          />
        ) : (
          <Button
            variant="ghost-secondary"
            label={t`Add block`}
            icon={Plus}
            disabled={disabled}
          />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className={classNames("my-2 block w-max", small ? "-right-16" : "")}
      >
        <div className="p-1">
          {blocks.map((block) => (
            <DropdownMenuItem
              key={block.type}
              onClick={() => onClick(block.type)}
            >
              <div className="grid max-w-md grid-cols-12 items-center">
                <div className="col-span-4 sm:col-span-3">
                  <div className="heading-base flex text-foreground">
                    <div
                      className={cn(
                        "mr-1 rounded-xl px-1 py-0.5 text-sm font-bold",
                        block.type === "input"
                          ? "bg-orange-200"
                          : "bg-primary-200"
                      )}
                    >
                      {block.type}
                    </div>
                  </div>
                </div>
                <div className="text-text-muted-foreground col-span-8 pr-2 text-sm sm:col-span-9 sm:pl-6">
                  <strong>{block.name}</strong>
                  <br />
                  <p className="text-sm">{block.description}</p>
                </div>
              </div>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
