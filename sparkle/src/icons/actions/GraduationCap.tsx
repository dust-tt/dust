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
      fill="currentColor"
      d="M4 11.333 0 9l12-7 12 7v8.5h-2v-7.333l-2 1.166v6.678l-.223.275A9.98 9.98 0 0 1 12 22a9.98 9.98 0 0 1-7.777-3.714L4 18.011zM6 12.5v4.792A7.98 7.98 0 0 0 12 20a7.98 7.98 0 0 0 6-2.708V12.5L12 16zM3.97 9 12 13.685 20.03 9 12 4.315z"
    />
  </svg>
);
export default SvgGraduationCap;
