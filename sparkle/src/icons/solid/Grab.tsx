import type { SVGProps } from "react";
import * as React from "react";
const SvgGrab = (props: SVGProps<SVGSVGElement>) => (
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
      d="M8.5 3.5c-1.101 0-2 .899-2 2s.899 2 2 2 2-.899 2-2-.899-2-2-2M16 3.5c-1.101 0-2 .899-2 2s.899 2 2 2 2-.899 2-2-.899-2-2-2M8.5 10c-1.101 0-2 .899-2 2s.899 2 2 2 2-.899 2-2-.899-2-2-2M16 10c-1.101 0-2 .899-2 2s.899 2 2 2 2-.899 2-2-.899-2-2-2M8.5 16.5c-1.101 0-2 .899-2 2s.899 2 2 2 2-.899 2-2-.899-2-2-2M16 16.5c-1.101 0-2 .899-2 2s.899 2 2 2 2-.899 2-2-.899-2-2-2"
    />
  </svg>
);
export default SvgGrab;
