import type { SVGProps } from "react";
import * as React from "react";
const SvgLightMode = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Zm8-10a8 8 0 0 1-8 8v-4a4 4 0 0 0 0-8V4a8 8 0 0 1 8 8Zm-8-4v8a4 4 0 0 1 0-8Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgLightMode;
