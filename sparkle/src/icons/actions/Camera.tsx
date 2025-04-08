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
      fill="#111418"
      d="m9.83 5-2 2H4v12h16V7h-3.828l-2-2H9.83ZM9 3h6l2 2h4.5c.553 0 .5-.052.5.5v15c0 .552.053.5-.5.5h-19c-.552 0-.5.052-.5-.5v-15c0-.552-.052-.5.5-.5h4.5l2-2Zm3 15a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11Zm0-2a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
    />
  </svg>
);
export default SvgCamera;
