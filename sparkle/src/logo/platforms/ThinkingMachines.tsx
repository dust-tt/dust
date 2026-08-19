import type { SVGProps } from "react";
import * as React from "react";

const SvgThinkingMachines = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 180 180"
    {...props}
  >
    <rect width={180} height={180} rx={16} fill="#E6E7E8" />
    <rect x={30} y={30} width={120} height={120} rx={12} fill="#31373D" />
  </svg>
);
export default SvgThinkingMachines;
