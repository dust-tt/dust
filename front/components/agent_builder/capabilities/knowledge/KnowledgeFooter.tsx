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
  const [isOpen, setOpen] = useState(true);
  const { removeNodeWithPath } = useDataSourceBuilderContext();

  const { field } = useSourcesFormController();

  if (field.value.in.length <= 0) {
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
          <div className="rounded-xl bg-muted dark:bg-muted-night">
            <ContextItem.List className="max-h-[183px] overflow-x-scroll">
              {field.value.in.map((path) => (
                <ContextItem
                  key={path}
                  title={path}
                  visual={<ContextItem.Visual visual={GithubLogo} />}
                  action={
                    <Checkbox
                      checked
                      onCheckedChange={() => removeNodeWithPath(path)}
                    />
                  }
                >
                  <span className="text-xs">{path}</span>
                </ContextItem>
              ))}
            </ContextItem.List>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
