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
      d="M9.001 3h6l2 2h4.5c.553 0 .5-.052.5.5v15c0 .552.053.5-.5.5h-19c-.552 0-.5.052-.5-.5v-15c0-.552-.052-.5.5-.5h4.5l2-2Zm3 16a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0-2a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"
    />
  </svg>
);
export default SvgCamera;
