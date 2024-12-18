import type { SVGProps } from "react";
import * as React from "react";
const SvgSlack = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#E01E5A"
      d="M6.216 14.643a2.1 2.1 0 1 1-4.2 0 2.1 2.1 0 0 1 2.1-2.102h2.1zm1.05 0a2.1 2.1 0 1 1 4.201 0v5.255A2.1 2.1 0 0 1 9.367 22c-1.162 0-2.1-.94-2.1-2.102z"
    />
    <path
      fill="#36C5F0"
      d="M9.367 6.204a2.1 2.1 0 0 1-2.1-2.102 2.1 2.1 0 1 1 4.2 0v2.102zm0 1.067a2.1 2.1 0 0 1 2.1 2.102 2.1 2.1 0 0 1-2.1 2.102H4.1A2.1 2.1 0 0 1 2 9.373 2.1 2.1 0 0 1 4.1 7.27z"
    />
    <path
      fill="#2EB67D"
      d="M17.784 9.373a2.099 2.099 0 1 1 4.2 0 2.1 2.1 0 0 1-2.1 2.102h-2.1zm-1.05 0a2.099 2.099 0 1 1-4.201 0V4.102a2.099 2.099 0 1 1 4.2 0z"
    />
    <path
      fill="#ECB22E"
      d="M14.633 17.796c1.162 0 2.1.94 2.1 2.102a2.099 2.099 0 1 1-4.2 0v-2.102zm0-1.05c-1.161 0-2.1-.94-2.1-2.103a2.1 2.1 0 0 1 2.1-2.102H19.9a2.1 2.1 0 0 1 2.1 2.102 2.1 2.1 0 0 1-2.1 2.102z"
    />
  </svg>
);
export default SvgSlack;
