import {
  buildColorClass,
  INDEXED_COLORS,
} from "@app/components/agent_builder/observability/constants";
import type { ConnectorProvider } from "@app/types/data_source";
import { cn } from "@dust-tt/sparkle";

const LABEL_COLOR_VARIANT = 900;
const VALUE_COLOR_VARIANT = 700;

const MIN_TILE_HEIGHT_FOR_VALUE = 24;
const MIN_TILE_HEIGHT_FOR_NAME_AND_VALUE = 42;
const GROUP_OUTLINE_INSET = 2;
const GROUP_OUTLINE_STROKE_WIDTH = 2;
const LEAF_STROKE_WIDTH = 1;
const LEAF_BORDER_RADIUS = 4;
const GROUP_LABEL_HEIGHT = 18;
const MIN_GROUP_WIDTH_FOR_LABEL = 40;
const MIN_GROUP_HEIGHT_FOR_LABEL = 24;

export interface DatasourceRetrievalTreemapNode {
  name: string;
  size: number;
  color: string;
  baseColor: string;
  mcpServerConfigIds?: string[];
  mcpServerDisplayName?: string;
  mcpServerName?: string;
  dataSourceId?: string;
  connectorProvider?: ConnectorProvider;
  parentId?: string | null;
  documentId?: string;
  sourceUrl?: string | null;
  children?: DatasourceRetrievalTreemapNode[];
  [key: string]: unknown;
}

interface DatasourceRetrievalTreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  value?: number;
  depth?: number;
  index?: number;
  color?: string;
  baseColor?: string;
  mcpServerConfigIds?: string[];
  mcpServerDisplayName?: string;
  mcpServerName?: string;
  dataSourceId?: string;
  connectorProvider?: ConnectorProvider;
  parentId?: string | null;
  documentId?: string;
  sourceUrl?: string | null;
  children?: DatasourceRetrievalTreemapNode[] | null;
  root?: {
    depth?: number;
    name?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    children?: unknown[] | null;
    value?: number;
  };
  onNodeClick?: (node: DatasourceRetrievalTreemapNode) => void;
}

export function DatasourceRetrievalTreemapContent({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name = "",
  value = 0,
  depth = 0,
  index,
  color = INDEXED_COLORS[0],
  baseColor = "orange",
  mcpServerConfigIds,
  mcpServerDisplayName,
  mcpServerName,
  dataSourceId,
  connectorProvider,
  parentId,
  documentId,
  sourceUrl,
  children,
  root,
  onNodeClick,
}: DatasourceRetrievalTreemapContentProps) {
  if (depth === 0) {
    return null;
  }

  if ((children?.length ?? 0) > 0) {
    return null;
  }

  const shouldShowValue = height >= MIN_TILE_HEIGHT_FOR_VALUE;
  const shouldShowName = height >= MIN_TILE_HEIGHT_FOR_NAME_AND_VALUE;
  const isClickable = !!onNodeClick;
  const leafClassName = isClickable ? `${color} cursor-pointer` : color;

  const rootX = root?.x ?? 0;
  const rootY = root?.y ?? 0;
  const rootWidth = root?.width ?? 0;
  const rootHeight = root?.height ?? 0;
  const rootChildrenCount = root?.children?.length ?? 0;

  const shouldShowGroupOutline =
    root?.depth === 1 &&
    typeof index === "number" &&
    index === rootChildrenCount - 1;

  const groupName = root?.name ?? "";
  const groupValue = typeof root?.value === "number" ? root.value : null;
  const groupLabel =
    groupValue !== null
      ? `${groupName} — ${groupValue.toLocaleString()}`
      : groupName;
  const shouldShowGroupLabel =
    shouldShowGroupOutline &&
    groupName.length > 0 &&
    rootWidth >= MIN_GROUP_WIDTH_FOR_LABEL &&
    rootHeight >= MIN_GROUP_HEIGHT_FOR_LABEL;

  const nameTextClassName = documentId ? "text-[10px]" : "text-xs";

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={LEAF_BORDER_RADIUS}
        fill="currentColor"
        className={leafClassName}
        stroke="white"
        strokeWidth={LEAF_STROKE_WIDTH}
        onClick={
          onNodeClick
            ? (e) => {
                e.stopPropagation();
                onNodeClick({
                  name,
                  size: value,
                  color,
                  baseColor,
                  mcpServerConfigIds,
                  mcpServerDisplayName,
                  mcpServerName,
                  dataSourceId,
                  connectorProvider,
                  parentId,
                  documentId,
                  sourceUrl,
                });
              }
            : undefined
        }
      />
      {shouldShowValue && (
        <foreignObject
          x={x}
          y={y}
          width={width}
          height={height}
          pointerEvents="none"
        >
          <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 overflow-hidden p-1 text-center">
            {shouldShowName && (
              <div
                className={cn(
                  "w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-medium",
                  nameTextClassName,
                  buildColorClass(baseColor, LABEL_COLOR_VARIANT)
                )}
              >
                {name}
              </div>
            )}
            <div
              className={cn(
                "text-xs",
                buildColorClass(baseColor, VALUE_COLOR_VARIANT)
              )}
            >
              {value.toLocaleString()}
            </div>
          </div>
        </foreignObject>
      )}
      {shouldShowGroupOutline && (
        <rect
          x={rootX + GROUP_OUTLINE_INSET}
          y={rootY + GROUP_OUTLINE_INSET}
          width={Math.max(0, rootWidth - GROUP_OUTLINE_INSET * 2)}
          height={Math.max(0, rootHeight - GROUP_OUTLINE_INSET * 2)}
          rx={2}
          fill="none"
          stroke="white"
          strokeWidth={GROUP_OUTLINE_STROKE_WIDTH}
          pointerEvents="none"
        />
      )}
      {shouldShowGroupLabel && (
        <foreignObject
          x={rootX}
          y={rootY}
          width={Math.max(0, rootWidth)}
          height={GROUP_LABEL_HEIGHT}
          pointerEvents="none"
        >
          <div className="flex h-full w-full items-center justify-center overflow-hidden">
            <div className="w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-white/70 px-1 py-0.5 text-center text-[11px] font-medium text-foreground dark:bg-black/30 dark:text-foreground-night">
              {groupLabel}
            </div>
          </div>
        </foreignObject>
      )}
    </g>
  );
}
