import {
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContextItem,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useSourcesFormController } from "@app/components/agent_builder/utils";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { DataSourceBuilderTreeItemType } from "@app/components/data_source_view/context/types";
import { getVisualForTreeItem } from "@app/components/data_source_view/context/utils";
import { useNodePath } from "@app/hooks/useNodePath";
import type { DataSourceViewContentNode } from "@app/types";
import { pluralize } from "@app/types";

function KnowledgeFooterItemReadablePath({
  node,
}: {
  node: DataSourceViewContentNode;
}) {
  const { owner } = useAgentBuilderContext();
  const disabled = !node.parentInternalIds?.length;
  const { fullPath, isLoading } = useNodePath({
    node,
    owner,
    disabled,
  });

  if (disabled) {
    return <></>;
  }

  return (
    <span className="text-xs">
      {isLoading
        ? "loading..."
        : [node.parentInternalId, ...fullPath.map((node) => node.title)].join(
            "/"
          )}
    </span>
  );
}

function KnowledgeFooterItem({
  item,
}: {
  item: DataSourceBuilderTreeItemType;
}) {
  const { removeNodeWithPath } = useDataSourceBuilderContext();
  const VisualComponent = getVisualForTreeItem(item);

  return (
    <ContextItem
      key={item.path}
      title={item.name}
      visual={<ContextItem.Visual visual={VisualComponent} />}
      action={
        <Checkbox checked onCheckedChange={() => removeNodeWithPath(item)} />
      }
    >
      {item.type === "node" && (
        <KnowledgeFooterItemReadablePath node={item.node} />
      )}
    </ContextItem>
  );
}

export function KnowledgeFooter() {
  const [isOpen, setOpen] = useState(true);

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
            <ContextItem.List className="max-h-40 overflow-x-scroll">
              {field.value.in.map((item) => (
                <KnowledgeFooterItem key={item.path} item={item} />
              ))}
            </ContextItem.List>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
