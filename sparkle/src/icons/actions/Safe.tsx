import type { SVGProps } from "react";
import * as React from "react";
const SvgSafe = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#111418"
      d="M20.005 20.333V22h-2v-1.334l-7.418 1.237a.5.5 0 0 1-.582-.493V20h-4v2h-2v-2h-1a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7V1.59a.5.5 0 0 1 .582-.493L21.17 2.86a1 1 0 0 1 .836.986V6h1v2h-1v7h1v2h-1v2.153a1 1 0 0 1-.836.986l-1.164.194ZM4.005 5v13h6V5h-6Zm8 14.639 8-1.334V4.694l-8-1.333v16.278Zm4.5-5.64c-.828 0-1.5-1.119-1.5-2.5 0-1.38.671-2.5 1.5-2.5.828 0 1.5 1.12 1.5 2.5 0 1.381-.672 2.5-1.5 2.5Z"
    />
  </svg>
);
export default SvgSafe;
