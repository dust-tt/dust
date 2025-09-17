import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowGoBack = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 25"
    {...props}
  >
    <path
      fill="currentColor"
      d="M8 7.036v4.021L2 6.031l6-5.026v4.021h5c4.418 0 8 3.6 8 8.042 0 4.441-3.582 8.041-8 8.041H4V19.1h9c3.314 0 6-2.7 6-6.031 0-3.331-2.686-6.032-6-6.032H8Z"
    />
  </svg>
);
export default SvgArrowGoBack;
