type StackedValuesPayload = {
  values: Record<string, { count: number } | undefined>;
};

interface RoundedBarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: StackedValuesPayload;
  seriesKey?: string;
  stackOrderKeys?: string[];
}

export function RoundedBarShape({
  x,
  y,
  width,
  height,
  fill,
  payload,
  seriesKey,
  stackOrderKeys,
}: RoundedBarShapeProps): JSX.Element {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return <g />;
  }

  if (width <= 0 || height <= 0) {
    return <rect x={x} y={y} width={width} height={height} fill={fill} />;
  }

  if (payload && seriesKey && stackOrderKeys && stackOrderKeys.length > 0) {
    const seriesValue = payload.values[seriesKey]?.count ?? 0;
    if (seriesValue <= 0) {
      return <rect x={x} y={y} width={width} height={height} fill={fill} />;
    }

    let topSeriesKey: string | null = null;
    for (let idx = stackOrderKeys.length - 1; idx >= 0; idx--) {
      const candidate = stackOrderKeys[idx];
      const value = payload.values[candidate]?.count ?? 0;
      if (value > 0) {
        topSeriesKey = candidate;
        break;
      }
    }

    if (topSeriesKey !== seriesKey) {
      return <rect x={x} y={y} width={width} height={height} fill={fill} />;
    }
  }

  const r = Math.max(0, Math.min(4, height, width / 2));
  const right = x + width;
  const bottom = y + height;
  const d = `M ${x} ${bottom} L ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} L ${right - r} ${y} A ${r} ${r} 0 0 1 ${right} ${y + r} L ${right} ${bottom} Z`;
  return <path d={d} fill={fill} />;
}
