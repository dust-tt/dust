import type { SVGProps } from "react";
import * as React from "react";
const SvgDust = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 7a5 5 0 0 0-5-5H2v10h4.998A2.5 2.5 0 0 0 7 17H2v5h5a2.5 2.5 0 0 0 0-5h5v5h5v-5h5v-5h-5a5 5 0 0 0 5-5V2H12v5ZM7 9a2 2 0 1 0 0-4v4Zm8-2a2 2 0 1 0 4 0h-4Zm-3 0a5 5 0 0 0 5 5H7a5 5 0 0 0 5-5Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgDust;
