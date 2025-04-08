import type { SVGProps } from "react";
import * as React from "react";
const SvgGraduationCap = (props: SVGProps<SVGSVGElement>) => (
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
      d="M4 11.333 0 9l12-7 12 7v8.5h-2v-7.333l-2 1.166v6.678l-.223.275A9.983 9.983 0 0 1 12 22a9.983 9.983 0 0 1-7.777-3.714L4 18.011v-6.678ZM6 12.5v4.792A7.979 7.979 0 0 0 12 20a7.978 7.978 0 0 0 6-2.708V12.5L12 16l-6-3.5ZM3.97 9 12 13.685 20.03 9 12 4.315 3.97 9Z"
    />
  </svg>
);
export default SvgGraduationCap;
