import type { SVGProps } from "react";
import * as React from "react";

const SvgGrok = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#grok_svg__a)">
      <path
        fill="#000"
        d="M0 4a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4z"
      />
      <g clipPath="url(#grok_svg__b)">
        <path
          fill="#fff"
          fillRule="evenodd"
          d="m9.953 14.468 5.983-4.423c.293-.218.712-.133.853.204a4.93 4.93 0 0 1-1.058 5.377c-1.463 1.465-3.5 1.786-5.361 1.054l-2.034.943c2.917 1.995 6.458 1.502 8.672-.715 1.756-1.758 2.3-4.154 1.79-6.315l.005.005c-.737-3.174.182-4.443 2.063-7.037q.068-.092.134-.186l-2.476 2.479v-.008L9.95 14.47m-1.233 1.073c-2.094-2.002-1.732-5.1.053-6.888 1.321-1.322 3.486-1.862 5.375-1.069l2.029-.937a5.9 5.9 0 0 0-1.372-.75 6.73 6.73 0 0 0-7.314 1.475c-1.9 1.901-2.498 4.827-1.472 7.322.767 1.866-.49 3.185-1.755 4.517-.449.473-.899.944-1.261 1.444l5.715-5.111"
          clipRule="evenodd"
        />
      </g>
    </g>
    <defs>
      <clipPath id="grok_svg__a">
        <rect width={24} height={24} fill="#fff" rx={4} />
      </clipPath>
      <clipPath id="grok_svg__b">
        <path fill="#fff" d="M3 3h18v18H3z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgGrok;
