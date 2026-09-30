import type { SVGProps } from "react";
import * as React from "react";

const SvgPauseFill = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <rect width={7} height={20} x={3} y={2} fill="currentColor" rx={2} />
    <rect width={7} height={20} x={14} y={2} fill="currentColor" rx={2} />
  </svg>
);
export default SvgPauseFill;
