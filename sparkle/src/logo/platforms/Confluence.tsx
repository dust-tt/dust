import type { SVGProps } from "react";
import * as React from "react";
const SvgConfluence = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Confluence_svg__a)">
      <path
        fill="url(#Confluence_svg__b)"
        d="M2.725 17.005c-.207.333-.44.72-.637 1.029a.626.626 0 0 0 .214.855l4.136 2.517a.644.644 0 0 0 .882-.213c.165-.274.379-.63.61-1.01 1.64-2.674 3.288-2.347 6.26-.944l4.103 1.929c.155.073.334.08.495.021a.636.636 0 0 0 .36-.335l1.97-4.405a.627.627 0 0 0-.318-.825 502.084 502.084 0 0 1-4.136-1.944c-5.576-2.678-10.314-2.505-13.939 3.325Z"
      />
      <path
        fill="url(#Confluence_svg__c)"
        d="M21.275 7.009c.207-.334.44-.72.637-1.03a.626.626 0 0 0-.213-.855L17.56 2.608a.641.641 0 0 0-.907.207c-.165.274-.379.63-.61 1.01-1.64 2.674-3.287 2.347-6.26.944L5.694 2.85a.636.636 0 0 0-.856.314L2.87 7.57a.627.627 0 0 0 .318.825c.866.402 2.587 1.205 4.137 1.944 5.588 2.674 10.326 2.495 13.95-3.329Z"
      />
    </g>
    <defs>
      <linearGradient
        id="Confluence_svg__b"
        x1={21.005}
        x2={16.492}
        y1={22.604}
        y2={12.081}
        gradientUnits="userSpaceOnUse"
      >
        <stop offset={0.18} stopColor="#0052CC" />
        <stop offset={1} stopColor="#2684FF" />
      </linearGradient>
      <linearGradient
        id="Confluence_svg__c"
        x1={3.074}
        x2={7.595}
        y1={1.196}
        y2={11.731}
        gradientUnits="userSpaceOnUse"
      >
        <stop offset={0.18} stopColor="#0052CC" />
        <stop offset={1} stopColor="#2684FF" />
      </linearGradient>
      <clipPath id="Confluence_svg__a">
        <path fill="#fff" d="M2 2.5h20v19H2z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgConfluence;
