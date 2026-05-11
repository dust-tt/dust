import type { SVGProps } from "react";
import * as React from "react";

const SvgZoomOut = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17.965 11a6.965 6.965 0 1 0-2.125 5.005 1 1 0 0 1 .165-.165 6.94 6.94 0 0 0 1.96-4.84M14 9.965a1.035 1.035 0 0 1 0 2.07H8a1.035 1.035 0 0 1 0-2.07zM20.035 11a9 9 0 0 1-1.959 5.613l3.655 3.656a1.034 1.034 0 1 1-1.462 1.462l-3.656-3.655A9 9 0 0 1 11 20.036 9.035 9.035 0 1 1 20.035 11"
    />
  </svg>
);
export default SvgZoomOut;
