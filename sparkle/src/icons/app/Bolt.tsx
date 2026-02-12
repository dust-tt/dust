import type { SVGProps } from "react";
import * as React from "react";

const SvgBolt = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M13 10h7l-9 13v-9H4l9-13v9Z" />
  </svg>
);
export default SvgBolt;
