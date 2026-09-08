import type { SVGProps } from "react";
import * as React from "react";

const SvgZendesk = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Zendesk_svg__a)">
      <rect width={24} height={24} fill="#F7F7F7" rx={6} />
      <path
        fill="#000"
        d="M12.818 5v10.5L21 5zM7.09 9.375C4.833 9.375 3 7.416 3 5h8.182c0 2.416-1.832 4.375-4.091 4.375M16.91 14.625c2.258 0 4.09 1.959 4.09 4.375h-8.182c0-2.416 1.832-4.375 4.091-4.375M11.182 8.5V19H3z"
      />
    </g>
    <defs>
      <clipPath id="Zendesk_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgZendesk;
