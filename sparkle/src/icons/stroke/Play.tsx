import type { SVGProps } from "react";
import * as React from "react";
const SvgPlay = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20 12 8 4v16l12-8Zm-3.606 0L10 7.737v8.526L16.394 12Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgPlay;
