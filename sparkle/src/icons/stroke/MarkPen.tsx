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
      d="m15.243 4.512-6.738 6.737-.707 2.121-1.04 1.041 2.828 2.828 1.04-1.04 2.122-.708 6.737-6.737-4.242-4.242Zm6.364 3.535a1 1 0 0 1 0 1.414l-7.778 7.778-2.122.707-1.414 1.415a1 1 0 0 1-1.414 0l-4.243-4.243a1 1 0 0 1 0-1.414L6.05 12.29l.707-2.122 7.779-7.778a1 1 0 0 1 1.414 0l5.657 5.657Zm-6.364-.707 1.414 1.414-4.95 4.95-1.414-1.414 4.95-4.95Zm-10.96 9.546 2.828 2.828-1.414 1.415-4.243-1.415 2.829-2.828Z"
    />
  </svg>
);
export default SvgMarkPen;
