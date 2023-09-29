import type { SVGProps } from "react";
import * as React from "react";
const SvgPause = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M7 5h2v14H7V5Zm8 0h2v14h-2V5Z" />
  </svg>
);
export default SvgPause;
