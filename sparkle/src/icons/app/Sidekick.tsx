import type { SVGProps } from "react";
import * as React from "react";

const SvgSidekick = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12.547 6.762 16 4l-.6 3H18a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4v-6a4 4 0 0 1 4-4h1.25l6.25-5zM3.709 10a.71.71 0 0 0-.709.709v5.582a.71.71 0 0 0 .709.709h2.488A5.95 5.95 0 0 0 9.5 16l.668-.445a3.3 3.3 0 0 1 3.664 0L14.5 16c.978.652 2.127 1 3.303 1h2.488a.71.71 0 0 0 .709-.709v-5.582a.71.71 0 0 0-.709-.709h-2.488a5.95 5.95 0 0 0-3.303 1l-.668.445a3.3 3.3 0 0 1-3.664 0L9.5 11a5.95 5.95 0 0 0-3.303-1zM6.5 11a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5m11 0a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5"
    />
  </svg>
);
export default SvgSidekick;
