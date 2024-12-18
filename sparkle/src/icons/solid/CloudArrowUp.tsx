import type { SVGProps } from "react";
import * as React from "react";
const SvgCloudArrowUp = (props: SVGProps<SVGSVGElement>) => (
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
      d="M9 20.986a8.5 8.5 0 1 1 7.715-12.983A6.5 6.5 0 0 1 17 20.981V21H9zM16 14l-4-4-4 4h3v4h2v-4z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgCloudArrowUp;
