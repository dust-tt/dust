import type { SVGProps } from "react";
import * as React from "react";
const SvgCube = (props: SVGProps<SVGSVGElement>) => (
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
      d="m12 1 9.5 5.5v11L12 23l-9.5-5.5v-11L12 1ZM5.494 7.078 12 10.844l6.506-3.766L12 3.31 5.494 7.078ZM4.5 8.813v7.534L11 20.11v-7.534L4.5 8.813ZM13 20.11l6.5-3.763V8.813L13 12.576v7.534Z"
    />
  </svg>
);
export default SvgCube;
