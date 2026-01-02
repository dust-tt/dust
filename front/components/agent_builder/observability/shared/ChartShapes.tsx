import type { ValuesPayload } from "@app/components/agent_builder/observability/utils";

function getStackValue(payload: ValuesPayload, key: string): number {
  const v = payload.values[key];
  if (typeof v === "number") {
    return v;
  }

  if (typeof v === "object" && v !== null) {
    if (typeof v.count === "number") {
      return v.count;
    }
    if (typeof v.percent === "number") {
      return v.percent;
    }
  }

  return 0;
}

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

  const toolValue = getStackValue(payload, toolName);
  if (toolValue <= 0) {
    return <rect x={x} y={y} width={width} height={height} fill={fill} />;
  }

  let topTool: string | undefined;
  for (let idx = stackOrder.length - 1; idx >= 0; idx--) {
    const candidate = stackOrder[idx];
    const value = getStackValue(payload, candidate);

    if (value > 0) {
      topTool = candidate;
      break;
    }
  }

  if (!topTool || topTool !== toolName) {
    return <rect x={x} y={y} width={width} height={height} fill={fill} />;
  }

  const r = Math.max(0, Math.min(4, height, width / 2));
  const right = x + width;
  const bottom = y + height;
  const d = `M ${x} ${bottom} L ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} L ${right - r} ${y} A ${r} ${r} 0 0 1 ${right} ${y + r} L ${right} ${bottom} Z`;
  return <path d={d} fill={fill} />;
}
