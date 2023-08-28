import type { SVGProps } from "react";
import * as React from "react";
const SvgWrench = (props: SVGProps<SVGSVGElement>) => (
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
      d="M5.329 3.272A3.5 3.5 0 0 1 9.8 7.745L20.646 18.59l-2.121 2.122L7.679 9.867a3.5 3.5 0 0 1-4.472-4.474L5.443 7.63a1.5 1.5 0 0 0 2.122-2.121L5.329 3.272Zm10.367 1.883 3.182-1.768 1.415 1.415-1.768 3.182-1.768.353-2.121 2.121-1.415-1.414 2.122-2.121.353-1.768Zm-7.07 7.778 2.12 2.122-4.95 4.95a1.5 1.5 0 0 1-2.218-2.015l.097-.107 4.95-4.95Z"
    />
  </svg>
);
export default SvgWrench;
