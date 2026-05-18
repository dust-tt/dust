import type { SVGProps } from "react";
import * as React from "react";

const SvgLinkBroken01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#link-broken-01_svg__a)">
      <path
        fill="currentColor"
        d="M13.965 22v-2a1.035 1.035 0 0 1 2.07 0v2a1.035 1.035 0 0 1-2.07 0M5.61 11.269a1.035 1.035 0 0 1 1.464 1.462l-2.12 2.123a2.964 2.964 0 1 0 4.191 4.192l2.123-2.121a1.035 1.035 0 1 1 1.462 1.464l-2.12 2.12a5.035 5.035 0 1 1-7.12-7.12zm12.743 7.085a1.036 1.036 0 0 1 1.463 0l1.414 1.415a1.034 1.034 0 1 1-1.462 1.462l-1.415-1.414a1.036 1.036 0 0 1 0-1.463M22 13.964a1.035 1.035 0 0 1 0 2.071h-2a1.035 1.035 0 0 1 0-2.07zM13.39 3.49a5.035 5.035 0 1 1 7.12 7.12l-2.121 2.121a1.035 1.035 0 0 1-1.464-1.462l2.12-2.123a2.964 2.964 0 1 0-4.192-4.192l-2.122 2.121a1.035 1.035 0 1 1-1.462-1.464zM4 7.965a1.035 1.035 0 0 1 0 2.07H2a1.035 1.035 0 0 1 0-2.07zM2.769 2.769a1.034 1.034 0 0 1 1.462 0l1.415 1.414a1.036 1.036 0 0 1-1.463 1.463L2.769 4.231a1.034 1.034 0 0 1 0-1.462M7.965 4V2a1.035 1.035 0 0 1 2.07 0v2a1.035 1.035 0 0 1-2.07 0"
      />
    </g>
    <defs>
      <clipPath id="link-broken-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgLinkBroken01;
