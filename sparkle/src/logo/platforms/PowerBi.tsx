import type { SVGProps } from "react";
import * as React from "react";

const SvgPowerBi = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 630 630"
    fill="none"
    {...props}
  >
    <defs>
      <linearGradient id="powerbi-lg1" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop stopColor="#EBBB14" offset="0%" />
        <stop stopColor="#B25400" offset="100%" />
      </linearGradient>
      <linearGradient id="powerbi-lg2" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop stopColor="#F9E583" offset="0%" />
        <stop stopColor="#DE9800" offset="100%" />
      </linearGradient>
      <path
        id="powerbi-path3"
        d="M346,604 L346,630 L320,630 L153,630 C138.640597,630 127,618.359403 127,604 L127,183 C127,168.640597 138.640597,157 153,157 L320,157 C334.359403,157 346,168.640597 346,183 L346,604 Z"
      />
      <filter
        id="powerbi-filter4"
        x="-9.1%"
        y="-6.3%"
        width="136.5%"
        height="116.9%"
        filterUnits="objectBoundingBox"
      >
        <feOffset
          dx={20}
          dy={10}
          in="SourceAlpha"
          result="shadowOffsetOuter1"
        />
        <feGaussianBlur
          stdDeviation={10}
          in="shadowOffsetOuter1"
          result="shadowBlurOuter1"
        />
        <feColorMatrix
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.053 0"
          type="matrix"
          in="shadowBlurOuter1"
        />
      </filter>
      <linearGradient id="powerbi-lg5" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop stopColor="#F9E68B" offset="0%" />
        <stop stopColor="#F3CD32" offset="100%" />
      </linearGradient>
    </defs>
    <g stroke="none" strokeWidth={1} fill="none" fillRule="evenodd">
      <g transform="translate(77.5, 0)">
        <rect
          fill="url(#powerbi-lg1)"
          x={256}
          y={0}
          width={219}
          height={630}
          rx={26}
        />
        <g>
          <use
            fill="black"
            fillOpacity={1}
            filter="url(#powerbi-filter4)"
            href="#powerbi-path3"
          />
          <use
            fill="url(#powerbi-lg2)"
            fillRule="evenodd"
            href="#powerbi-path3"
          />
        </g>
        <path
          d="M219,604 L219,630 L193,630 L26,630 C11.6405965,630 0,618.359403 0,604 L0,341 C0,326.640597 11.6405965,315 26,315 L193,315 C207.359403,315 219,326.640597 219,341 L219,604 Z"
          fill="url(#powerbi-lg5)"
        />
      </g>
    </g>
  </svg>
);

export default SvgPowerBi;
