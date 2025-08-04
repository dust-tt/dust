import {
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContextItem,
  GithubLogo,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useSourcesFormController } from "@app/components/agent_builder/utils";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import { pluralize } from "@app/types";

export function KnowledgeFooter() {
  const [isOpen, setOpen] = useState(false);
  const { removeNode } = useDataSourceBuilderContext();

  const { field } = useSourcesFormController();

  if (!field.value.in) {
    return <></>;
  }

  return (
    <div className="px-4 py-5">
      <Collapsible open={isOpen} onOpenChange={setOpen}>
        <CollapsibleTrigger isOpen={isOpen}>
          <span className="heading-sm text-muted-foreground">
            Selection ({field.value.in.length} item
            {pluralize(field.value.in.length)})
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ContextItem.List className="rounded-xl bg-muted px-1.5 py-2 dark:bg-muted-night">
            {field.value.in.map((path) => (
              <ContextItem
                key={path}
                title={path}
                visual={<ContextItem.Visual visual={GithubLogo} />}
                action={
                  <Checkbox
                    checked
                    onCheckedChange={() => removeNode(path.split(".")[-1])}
                  />
                }
              >
                <span className="text-xs">{path}</span>
              </ContextItem>
            ))}
          </ContextItem.List>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
