import type { SVGProps } from "react";
import * as React from "react";

const SvgToggle02Left = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20.965 12A2.965 2.965 0 0 0 18 9.035h-8a1.035 1.035 0 0 1 0-2.07h8a5.035 5.035 0 0 1 0 10.07h-8a1.035 1.035 0 0 1 0-2.07h8A2.965 2.965 0 0 0 20.966 12"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M10.965 12a3.965 3.965 0 1 0-7.93 0 3.965 3.965 0 0 0 7.93 0m2.07 0a6.035 6.035 0 1 1-12.07 0 6.035 6.035 0 0 1 12.07 0"
    />
  </svg>
);
export default SvgToggle02Left;
