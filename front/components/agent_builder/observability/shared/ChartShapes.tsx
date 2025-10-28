import type { ValuesPayload } from "@app/components/agent_builder/observability/utils";

export function RoundedTopBarShape({
  x,
  y,
  width,
  height,
  fill,
  payload,
  isTopForPayload,
  seriesIdx,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: ValuesPayload;
  isTopForPayload: (p: ValuesPayload, i: number) => boolean;
  seriesIdx: number;
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
  const r = 4;
  if (!isTopForPayload(payload, seriesIdx)) {
    return <rect x={x} y={y} width={width} height={height} fill={fill} />;
  }
  const right = x + width;
  const bottom = y + height;
  const d = `M ${x} ${bottom} L ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} L ${right - r} ${y} A ${r} ${r} 0 0 1 ${right} ${y + r} L ${right} ${bottom} Z`;
  return <path d={d} fill={fill} />;
}
