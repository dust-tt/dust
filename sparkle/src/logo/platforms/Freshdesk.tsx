import type { SVGProps } from "react";
import * as React from "react";

const SvgFreshdesk = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Freshdesk_svg__a)">
      <path
        fill="#25C16F"
        d="M11.969 2h7.511A2.5 2.5 0 0 1 22 4.523v7.508A9.967 9.967 0 0 1 12.031 22h-.057A9.963 9.963 0 0 1 2 12.034C2 6.51 6.454 2.057 11.969 2"
      />
      <path
        fill="#fff"
        d="M11.969 6.455a4.58 4.58 0 0 0-4.58 4.58v3.113c.019.833.69 1.505 1.523 1.523h1.295v-3.577h-1.75v-1a3.557 3.557 0 0 1 3.552-3.356 3.55 3.55 0 0 1 3.547 3.356v1h-1.775v3.58h1.17v.056a1.427 1.427 0 0 1-1.406 1.406h-1.397c-.114 0-.24.057-.24.17a.25.25 0 0 0 .24.24h1.406a1.83 1.83 0 0 0 1.818-1.819v-.114a1.5 1.5 0 0 0 1.17-1.477v-3.042c.057-2.58-1.989-4.636-4.58-4.636z"
      />
    </g>
    <defs>
      <clipPath id="Freshdesk_svg__a">
        <path fill="#fff" d="M2 2h20v20H2z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgFreshdesk;
