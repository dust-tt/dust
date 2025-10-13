import type { SVGProps } from "react";
import * as React from "react";
const SvgTelescope = (props: SVGProps<SVGSVGElement>) => (
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
      d="m23.026 7.196-11.101 6.408 3.943 6.9-1.736.992L11 16.015l-3.132 5.481-1.736-.992 4.013-7.027-4.073 2.353-.5-.867-2.598 1.5-1-1.73L4.57 13.23l-.499-.865 4.6-2.657-.5-.865L20.027 2l3 5.196Zm-12.12 2.38 1 1.732 8.388-4.844-1-1.732-8.389 4.843Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgTelescope;
