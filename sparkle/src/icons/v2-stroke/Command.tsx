import type { SVGProps } from "react";
import * as React from "react";

const SvgCommand = (props: SVGProps<SVGSVGElement>) => (
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
      d="M7.965 16.035H6A1.965 1.965 0 1 0 7.965 18zm12 1.965c0-1.085-.88-1.965-1.965-1.965h-1.965V18a1.965 1.965 0 1 0 3.93 0m-9.93-4.035h3.93v-3.93h-3.93zM7.965 6A1.965 1.965 0 1 0 6 7.965h1.965zm12 0a1.965 1.965 0 1 0-3.93 0v1.965H18c1.085 0 1.965-.88 1.965-1.965m2.07 0A4.035 4.035 0 0 1 18 10.035h-1.965v3.93H18A4.035 4.035 0 1 1 13.965 18v-1.965h-3.93V18A4.035 4.035 0 1 1 6 13.965h1.965v-3.93H6A4.035 4.035 0 1 1 10.035 6v1.965h3.93V6a4.035 4.035 0 0 1 8.07 0"
    />
  </svg>
);
export default SvgCommand;
