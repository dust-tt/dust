import type { SVGProps } from "react";
import * as React from "react";

const SvgPilcrow02 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16.465 20V4a1.035 1.035 0 0 1 2.07 0v16a1.035 1.035 0 0 1-2.07 0"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M19.5 2.965a1.035 1.035 0 0 1 0 2.07h-4.465v13.93H19.5a1.035 1.035 0 0 1 0 2.07H12a1.035 1.035 0 0 1 0-2.07h.965v-5.93H9a5.035 5.035 0 0 1 0-10.07zM6.035 8A2.965 2.965 0 0 0 9 10.965h3.965v-5.93H9A2.965 2.965 0 0 0 6.035 8"
    />
  </svg>
);
export default SvgPilcrow02;
