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
      d="M20.502 5.922 12 1 3.498 5.922 12 10.845l8.502-4.923ZM2.5 7.656V17.5l8.5 4.921v-9.845l-8.5-4.92ZM13 22.42l8.5-4.921V7.655L13 12.576v9.845Z"
    />
  </svg>
);
export default SvgCube;
