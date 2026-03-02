import type { SVGProps } from "react";
import * as React from "react";

const SvgImage = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <rect width={20} height={16} x={2} y={4} fill="#FFD046" rx={2} />
    <circle cx={7} cy={9} r={2} fill="#fff" />
    <path fill="#fff" d="m11 10-6 8h15v-8l-2-2-4 5z" />
  </svg>
);
export default SvgImage;
