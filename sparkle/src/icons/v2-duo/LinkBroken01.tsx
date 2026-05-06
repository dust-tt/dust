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
    <g fill="currentColor" clipPath="url(#link-broken-01_svg__a)">
      <path
        d="M13.965 22v-2a1.035 1.035 0 0 1 2.07 0v2a1.035 1.035 0 0 1-2.07 0m4.389-3.646a1.036 1.036 0 0 1 1.463 0l1.414 1.415a1.034 1.034 0 1 1-1.462 1.462l-1.415-1.414a1.036 1.036 0 0 1 0-1.463M22 13.964a1.035 1.035 0 0 1 0 2.071h-2a1.035 1.035 0 0 1 0-2.07zm-18-6a1.035 1.035 0 0 1 0 2.071H2a1.035 1.035 0 0 1 0-2.07zM2.769 2.77a1.034 1.034 0 0 1 1.462 0l1.415 1.414a1.036 1.036 0 0 1-1.463 1.463L2.769 4.231a1.034 1.034 0 0 1 0-1.462M7.965 4V2a1.035 1.035 0 0 1 2.07 0v2a1.035 1.035 0 0 1-2.07 0"
        opacity={0.4}
      />
      <path d="M5.612 11.268a1.035 1.035 0 1 1 1.463 1.464l-2.121 2.12a2.965 2.965 0 0 0 4.193 4.194l2.121-2.12a1.035 1.035 0 1 1 1.464 1.463l-2.121 2.121A5.036 5.036 0 0 1 3.49 13.39zm7.777-7.778a5.036 5.036 0 0 1 7.121 7.12l-2.12 2.122a1.035 1.035 0 0 1-1.465-1.464l2.122-2.121a2.965 2.965 0 0 0-4.194-4.194l-2.121 2.122a1.035 1.035 0 0 1-1.464-1.463z" />
    </g>
    <defs>
      <clipPath id="link-broken-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgLinkBroken01;
