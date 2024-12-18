import type { SVGProps } from "react";
import * as React from "react";
const SvgCloudX = (props: SVGProps<SVGSVGElement>) => (
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
      d="M9 20.986a8.5 8.5 0 1 1 7.715-12.983A6.5 6.5 0 0 1 17 20.981V21H9zm-.207-9.279 1.793 1.793-1.793 1.793 1.414 1.414L12 14.914l1.793 1.793 1.414-1.414-1.793-1.793 1.793-1.793-1.414-1.414L12 12.086l-1.793-1.793z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgCloudX;
