import type { SVGProps } from "react";
import * as React from "react";
const SvgClaude = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Claude_svg__a)">
      <rect width={24} height={24} fill="#D4A480" rx={4} />
      <path
        fill="#000"
        d="M15.364 6H12.74l4.779 12h2.625L15.364 6ZM7.78 6 3 18h2.679l.964-2.52h5.014l.975 2.52h2.679L10.52 6H7.78Zm-.258 7.25L9.15 9.03l1.64 4.22H7.52Z"
      />
    </g>
    <defs>
      <clipPath id="Claude_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgClaude;
