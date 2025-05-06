import type { SVGProps } from "react";
import * as React from "react";
const SvgHome = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M4 21V11l8-8 8 8v10H4Zm14-2v-7.172l-6-6-6 6V19h12Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgHome;
