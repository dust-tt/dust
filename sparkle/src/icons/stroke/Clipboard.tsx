import * as React from "react";
import type { SVGProps } from "react";
const SvgClipboard = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17 17v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4V3.007C7 2.451 7.449 2 8.007 2h12.986C21.549 2 22 2.449 22 3.007l-.003 12.985c0 .557-.449 1.008-1.008 1.008H17Zm-2 0H8.007A1.006 1.006 0 0 1 7 15.992V9H4v11h11v-3Zm4.997-2L20 4H9v11h10.997Z"
    />
  </svg>
);
export default SvgClipboard;
