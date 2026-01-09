import type { SVGProps } from "react";
import * as React from "react";
const SvgBoltOff = (props: SVGProps<SVGSVGElement>) => (
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
      d="m22 22-1.5 1.5-5.82-5.82L11 23v-9H4l2.863-4.137L.5 3.5 2 2l20 20Zm-9-12h7l-2.864 4.136-7.819-7.819L13 1v9Z"
    />
  </svg>
);
export default SvgBoltOff;
