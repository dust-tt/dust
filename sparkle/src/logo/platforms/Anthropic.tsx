import type { SVGProps } from "react";
import * as React from "react";
const SvgAnthropic = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#000"
      d="M15.364 6H12.74l4.779 12h2.625L15.364 6ZM7.78 6 3 18h2.679l.964-2.52h5.014l.975 2.52h2.679L10.52 6H7.78Zm-.258 7.25L9.15 9.03l1.64 4.22H7.52Z"
    />
  </svg>
);
export default SvgAnthropic;
