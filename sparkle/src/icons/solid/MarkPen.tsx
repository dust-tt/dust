import type { SVGProps } from "react";
import * as React from "react";
const SvgMarkPen = (props: SVGProps<SVGSVGElement>) => (
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
      d="m15.95 2.39 5.657 5.657a1 1 0 0 1 0 1.414l-7.778 7.778-2.122.707-1.414 1.415a1 1 0 0 1-1.414 0l-4.243-4.243a1 1 0 0 1 0-1.414L6.05 12.29l.707-2.122 7.779-7.778a1 1 0 0 1 1.414 0Zm.707 3.536-6.364 6.364 1.414 1.414 6.364-6.364-1.414-1.414ZM4.283 16.886l2.828 2.828-1.414 1.415-4.243-1.415 2.829-2.828Z"
    />
  </svg>
);
export default SvgMarkPen;
