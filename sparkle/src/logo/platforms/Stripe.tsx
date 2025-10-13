import type { SVGProps } from "react";
import * as React from "react";
const SvgStripe = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#635BFF"
      fillRule="evenodd"
      d="M10.781 8.36c0-.771.605-1.068 1.606-1.068 1.437 0 3.25.455 4.687 1.266V3.91C15.505 3.257 13.956 3 12.387 3 8.551 3 6 5.097 6 8.598c0 5.46 7.181 4.589 7.181 6.943 0 .91-.756 1.206-1.814 1.206-1.569 0-3.572-.672-5.16-1.582v4.707A12.6 12.6 0 0 0 11.368 21C15.297 21 18 18.963 18 15.422c-.019-5.895-7.219-4.846-7.219-7.062Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgStripe;
