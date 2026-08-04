import type { SVGProps } from "react";
import * as React from "react";

const SvgModjo = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 80 80"
    {...props}
  >
    <rect width="80" height="80" rx="40" fill="#111827" />
    <rect x="17.6" y="32" width="6.4" height="18.4" rx="3.2" fill="white" />
    <rect x="27.2" y="14.4" width="6.4" height="51.2" rx="3.2" fill="white" />
    <rect x="36.8" y="24" width="6.4" height="36" rx="3.2" fill="white" />
    <rect x="46.4" y="14.4" width="6.4" height="51.2" rx="3.2" fill="white" />
    <rect x="56" y="32" width="6.4" height="18.4" rx="3.2" fill="white" />
  </svg>
);
export default SvgModjo;
