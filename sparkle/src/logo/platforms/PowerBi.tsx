import type { SVGProps } from "react";
import * as React from "react";

const SvgPowerBi = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#PowerBi_svg__a)">
      <path
        fill="url(#PowerBi_svg__b)"
        d="M18.715 2h-5.302a.825.825 0 0 0-.825.825v18.35c0 .456.37.825.825.825h5.302c.456 0 .825-.37.825-.825V2.825A.825.825 0 0 0 18.715 2"
      />
      <g filter="url(#PowerBi_svg__c)">
        <path
          fill="#000"
          d="M15.445 21.175V22H9.318a.825.825 0 0 1-.825-.825V7.81c0-.456.37-.826.825-.826h5.302c.456 0 .825.37.825.826z"
        />
      </g>
      <path
        fill="url(#PowerBi_svg__d)"
        d="M15.445 21.175V22H9.318a.825.825 0 0 1-.825-.825V7.81c0-.456.37-.826.825-.826h5.302c.456 0 .825.37.825.826z"
      />
      <path
        fill="url(#PowerBi_svg__e)"
        fillRule="evenodd"
        d="M11.413 21.175V22H5.286a.825.825 0 0 1-.825-.825v-8.35c0-.455.37-.825.825-.825h5.302c.456 0 .825.37.825.825z"
        clipRule="evenodd"
      />
    </g>
    <defs>
      <linearGradient
        id="PowerBi_svg__b"
        x1={16.064}
        x2={16.064}
        y1={2}
        y2={22}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#EBBB14" />
        <stop offset={1} stopColor="#B25400" />
      </linearGradient>
      <linearGradient
        id="PowerBi_svg__d"
        x1={11.969}
        x2={11.969}
        y1={6.984}
        y2={22}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#F9E583" />
        <stop offset={1} stopColor="#DE9800" />
      </linearGradient>
      <linearGradient
        id="PowerBi_svg__e"
        x1={7.937}
        x2={7.937}
        y1={12}
        y2={22}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#F9E68B" />
        <stop offset={1} stopColor="#F3CD32" />
      </linearGradient>
      <clipPath id="PowerBi_svg__a">
        <path fill="#fff" d="M2 2h20v20H2z" />
      </clipPath>
      <filter
        id="PowerBi_svg__c"
        width={8.222}
        height={16.286}
        x={8.493}
        y={6.667}
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
      >
        <feFlood floodOpacity={0} result="BackgroundImageFix" />
        <feColorMatrix
          in="SourceAlpha"
          result="hardAlpha"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
        />
        <feOffset dx={0.635} dy={0.317} />
        <feGaussianBlur stdDeviation={0.317} />
        <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.0530212 0" />
        <feBlend
          in2="BackgroundImageFix"
          result="effect1_dropShadow_2594_162"
        />
        <feBlend
          in="SourceGraphic"
          in2="effect1_dropShadow_2594_162"
          result="shape"
        />
      </filter>
    </defs>
  </svg>
);
export default SvgPowerBi;
