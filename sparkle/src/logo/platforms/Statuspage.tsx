import type { SVGProps } from "react";
import * as React from "react";

const SvgStatuspage = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <defs>
      <linearGradient
        id="Statuspage_svg__a"
        x1={523.178}
        x2={523.178}
        y1={864.9}
        y2={-49.785}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#2684FF" />
        <stop offset={0.82} stopColor="#0052CC" />
      </linearGradient>
    </defs>
    <path
      fill="url(#Statuspage_svg__a)"
      d="M12.04 20.24a5.163 5.163 0 1 0 0-10.326 5.163 5.163 0 0 0 0 10.326"
    />
    <path
      fill="#2684FF"
      d="m1.14 9.11 2.775 3.288a.59.59 0 0 0 .84.062c4.495-4.03 10.061-4.03 14.568 0a.59.59 0 0 0 .84-.062L22.94 9.11a.59.59 0 0 0-.068-.831c-6.51-5.705-15.142-5.705-21.664 0a.59.59 0 0 0-.068.831"
    />
  </svg>
);
export default SvgStatuspage;
