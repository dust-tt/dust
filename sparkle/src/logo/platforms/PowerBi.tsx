import type { SVGProps } from "react";
import * as React from "react";

const SvgPowerBi = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
    width="1em"
    height="1em"
    viewBox="0 0 630 630"
    {...props}
  >
    <defs>
      <linearGradient id="PowerBi_svg__a" x1="50%" x2="50%" y1="0%" y2="100%">
        <stop offset="0%" stopColor="#EBBB14" />
        <stop offset="100%" stopColor="#B25400" />
      </linearGradient>
      <linearGradient id="PowerBi_svg__d" x1="50%" x2="50%" y1="0%" y2="100%">
        <stop offset="0%" stopColor="#F9E583" />
        <stop offset="100%" stopColor="#DE9800" />
      </linearGradient>
      <linearGradient id="PowerBi_svg__e" x1="50%" x2="50%" y1="0%" y2="100%">
        <stop offset="0%" stopColor="#F9E68B" />
        <stop offset="100%" stopColor="#F3CD32" />
      </linearGradient>
      <filter
        id="PowerBi_svg__b"
        width="136.5%"
        height="116.9%"
        x="-9.1%"
        y="-6.3%"
        filterUnits="objectBoundingBox"
      >
        <feOffset
          dx={20}
          dy={10}
          in="SourceAlpha"
          result="shadowOffsetOuter1"
        />
        <feGaussianBlur
          in="shadowOffsetOuter1"
          result="shadowBlurOuter1"
          stdDeviation={10}
        />
        <feColorMatrix
          in="shadowBlurOuter1"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.0530211976 0"
        />
      </filter>
      <path
        id="PowerBi_svg__c"
        d="M346 604v26H153c-14.36 0-26-11.64-26-26V183c0-14.36 11.64-26 26-26h167c14.36 0 26 11.64 26 26z"
      />
    </defs>
    <g fill="none" fillRule="evenodd" transform="translate(77.5)">
      <rect
        width={219}
        height={630}
        x={256}
        fill="url(#PowerBi_svg__a)"
        rx={26}
      />
      <use
        xlinkHref="#PowerBi_svg__c"
        fill="#000"
        filter="url(#PowerBi_svg__b)"
      />
      <use xlinkHref="#PowerBi_svg__c" fill="url(#PowerBi_svg__d)" />
      <path
        fill="url(#PowerBi_svg__e)"
        d="M219 604v26H26c-14.36 0-26-11.64-26-26V341c0-14.36 11.64-26 26-26h167c14.36 0 26 11.64 26 26z"
      />
    </g>
  </svg>
);
export default SvgPowerBi;
