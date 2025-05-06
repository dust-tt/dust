import type { SVGProps } from "react";
import * as React from "react";
const SvgCamera = (props: SVGProps<SVGSVGElement>) => (
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
      d="M2 5c6.667-.012 13.333-.012 20 0v16c-6.667.012-13.333.013-20 0V5Zm2 2v12h16V7H4Zm10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 2a5 5 0 1 1 0-10 5 5 0 0 1 0 10ZM5 2h5v2H5V2Z"
    />
  </svg>
);
export default SvgCamera;
