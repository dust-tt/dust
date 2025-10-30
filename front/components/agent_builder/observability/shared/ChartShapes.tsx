import type { ValuesPayload } from "@app/components/agent_builder/observability/utils";

export function RoundedTopBarShape({
  x,
  y,
  width,
  height,
  fill,
  payload,
  toolName,
  stackOrder,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: ValuesPayload;
  toolName: string;
  stackOrder: string[];
}) {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    !payload
  ) {
    return <g />;
  }

  const toolValue = payload.values[toolName] ?? 0;
  if (toolValue === 0) {
    return <rect x={x} y={y} width={width} height={height} fill={fill} />;
  }

  let topTool: string | undefined;
  for (let idx = stackOrder.length - 1; idx >= 0; idx--) {
    const candidate = stackOrder[idx];
    const value = payload.values[candidate] ?? 0;

    if (value > 0) {
      topTool = candidate;
      break;
    }
  }

  if (!topTool || topTool !== toolName) {
    return <rect x={x} y={y} width={width} height={height} fill={fill} />;
  }

  const r = 4;
  const right = x + width;
  const bottom = y + height;
  const d = `M ${x} ${bottom} L ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} L ${right - r} ${y} A ${r} ${r} 0 0 1 ${right} ${y + r} L ${right} ${bottom} Z`;
  return <path d={d} fill={fill} />;
}
