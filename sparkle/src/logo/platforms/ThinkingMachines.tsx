import type { SVGProps } from "react";
import * as React from "react";

const SvgThinkingMachines = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <rect width={24} height={24} fill="#E6E7E8" rx={6} />
    <rect width={14} height={14} x={5} y={5} fill="#31373D" rx={2} />
  </svg>
);
export default SvgThinkingMachines;
