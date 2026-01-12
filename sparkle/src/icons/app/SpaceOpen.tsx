import type { SVGProps } from "react";
import * as React from "react";
const SvgSpaceOpen = (props: SVGProps<SVGSVGElement>) => (
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
      d="M22 6.5v11L12 23 2 17.5v-11L12 1l10 5.5ZM4.073 7.64 12 12l7.926-4.36L12 3.282l-7.927 4.36Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgSpaceOpen;
