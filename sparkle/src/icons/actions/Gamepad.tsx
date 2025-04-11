import type { SVGProps } from "react";
import * as React from "react";
const SvgGamepad = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17 4a6 6 0 0 1 6 6v4a6 6 0 0 1-6 6H7a6 6 0 0 1-6-6v-4a6 6 0 0 1 6-6h10Zm0 2H7a4 4 0 0 0-3.995 3.8L3 10v4a4 4 0 0 0 3.8 3.995L7 18h10a4 4 0 0 0 3.995-3.8L21 14v-4a4 4 0 0 0-3.8-3.995L17 6Zm-7 3v2h2v2H9.999L10 15H8l-.001-2H6v-2h2V9h2Zm8 4v2h-2v-2h2Zm-2-4v2h-2V9h2Z"
    />
  </svg>
);
export default SvgGamepad;
