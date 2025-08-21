import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContextItem,
  LoadingBlock,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useSourcesFormController } from "@app/components/agent_builder/utils";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { DataSourceBuilderTreeItemType } from "@app/components/data_source_view/context/types";
import { getVisualForTreeItem } from "@app/components/data_source_view/context/utils";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useNodePath } from "@app/hooks/useNodePath";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import type { DataSourceViewContentNode } from "@app/types";
import { pluralize, removeNulls } from "@app/types";

function KnowledgeFooterItemReadablePath({
  node,
}: {
  node: DataSourceViewContentNode;
}) {
  const { owner } = useAgentBuilderContext();
  const { fullPath, isLoading } = useNodePath({
    node,
    owner,
  });

  return (
    <div>
      {isLoading ? (
        <LoadingBlock className="h-4 w-[250px]" />
      ) : (
        <span className="text-xs">
          {removeNulls(
            fullPath.map((node, index) =>
              index === 0
                ? getDataSourceNameFromView(node.dataSourceView)
                : node.parentTitle
            )
          ).join("/")}
        </span>
      )}
    </div>
  );
}

function KnowledgeFooterItem({
  item,
}: {
  item: DataSourceBuilderTreeItemType;
}) {
  const { isDark } = useTheme();
  const { removeNodeWithPath } = useDataSourceBuilderContext();
  const VisualComponent = getVisualForTreeItem(item, isDark);

  return (
    <ContextItem
      key={item.path}
      title={item.name}
      visual={<ContextItem.Visual visual={VisualComponent} />}
      action={
        <Button
          size="mini"
          variant="ghost"
          icon={XMarkIcon}
          onClick={() => removeNodeWithPath(item)}
        />
      }
      subElement={
        item.type === "node" && (
          <KnowledgeFooterItemReadablePath node={item.node} />
        )
      }
    />
  );
}

export function KnowledgeFooter() {
  const [isOpen, setOpen] = useState(true);

  const { field } = useSourcesFormController();

  if (field.value.in.length <= 0) {
    return <></>;
  }

  return (
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
  );
}
