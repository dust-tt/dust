import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContextItem,
  Icon,
  LoadingBlock,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { useSourcesFormController } from "@app/components/agent_builder/utils";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { DataSourceBuilderTreeItemType } from "@app/components/data_source_view/context/types";
import {
  getSpaceNameFromTreeItem,
  getVisualForTreeItem,
} from "@app/components/data_source_view/context/utils";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useNodePath } from "@app/hooks/useNodePath";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import type { DataSourceViewContentNode } from "@app/types";
import { pluralize, removeNulls } from "@app/types";

function KnowledgeFooterItemReadablePath({
  node,
  item,
}: {
  node?: DataSourceViewContentNode;
  item: DataSourceBuilderTreeItemType;
}) {
  const { owner } = useAgentBuilderContext();
  const { spaces } = useSpacesContext();
  const { fullPath, isLoading } = useNodePath({
    node,
    owner,
  });
  const spaceName = getSpaceNameFromTreeItem(item, spaces);

  return (
    <div>
      {node && isLoading ? (
        <LoadingBlock className="h-4 w-[250px]" />
      ) : (
        <span className="text-xs">
          {item.type === "data_source" ? (
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            spaceName || ""
          ) : (
            <>
              {spaceName && `${spaceName} / `}
              {node &&
                removeNulls(
                  fullPath.map((node, index) =>
                    index === 0
                      ? getDataSourceNameFromView(node.dataSourceView)
                      : node.parentTitle
                  )
                ).join(" / ")}
            </>
          )}
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
      truncateSubElement
      visual={<Icon size="sm" visual={VisualComponent} />}
      action={
        <Button
          size="mini"
          variant="ghost"
          icon={XMarkIcon}
          onClick={() => removeNodeWithPath(item)}
        />
      }
      subElement={
        (item.type === "node" || item.type === "data_source") && (
          <KnowledgeFooterItemReadablePath
            node={item.type === "node" ? item.node : undefined}
            item={item}
          />
        )
      }
    />
  );
}

export function KnowledgeFooter() {
  const { field } = useSourcesFormController();
  const [isOpen, setOpen] = useState(field.value.in.length > 0);

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
          <ContextItem.List className="max-h-40 overflow-y-auto">
            {field.value.in.length > 0 ? (
              field.value.in.map((item) => (
                <KnowledgeFooterItem key={item.path} item={item} />
              ))
            ) : (
              <ContextItem title="No selection" visual={null} />
            )}
          </ContextItem.List>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
