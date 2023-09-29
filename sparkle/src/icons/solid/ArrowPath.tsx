import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowPath = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 5.5A6.5 6.5 0 0 0 5.5 12h-3a9.5 9.5 0 0 1 16.218-6.718L21 3v6.5h-6.5l2.096-2.096A6.48 6.48 0 0 0 12 5.5ZM7.404 16.596 9.5 14.5H3V21l2.282-2.282A9.5 9.5 0 0 0 21.5 12h-3a6.5 6.5 0 0 1-11.096 4.596Z"
    />
  </svg>
);
export default SvgArrowPath;
