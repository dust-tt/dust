import type { SVGProps } from "react";
import * as React from "react";

const SvgStrikethrough01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16.5 7.5c-.5-1.9-2.3-3-4.5-3-2.8 0-4.5 1.5-4.5 3.4 0 1.6 1 2.7 3.5 3.4M4 12h16M8 16.5c.5 1.9 2.2 3 4.2 3 2.7 0 4.5-1.4 4.5-3.4 0-.8-.2-1.5-.7-2.1"
    />
  </svg>
);
export default SvgStrikethrough01;
