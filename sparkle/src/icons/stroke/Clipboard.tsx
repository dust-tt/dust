import type { SVGProps } from "react";
import * as React from "react";
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
      d="M17 17v5H2V6.992C3.666 7.02 5.334 7 7 7V2h15l-.003 15H17Zm-2 0H7V9H4v11h11v-3Zm4.997-2L20 4H9v11h10.997Z"
    />
  </svg>
);
export default SvgClipboard;
