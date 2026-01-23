import type { SVGProps } from "react";
import * as React from "react";
const SvgSupabase = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Supabase_svg__a)">
      <path
        fill="url(#Supabase_svg__b)"
        d="M13.605 21.52c-.498.637-1.51.288-1.521-.526L11.908 9.09h7.883c1.427 0 2.224 1.674 1.336 2.81l-7.522 9.618Z"
      />
      <path
        fill="url(#Supabase_svg__c)"
        fillOpacity={0.2}
        d="M13.605 21.52c-.498.637-1.51.288-1.521-.526L11.908 9.09h7.883c1.427 0 2.224 1.674 1.336 2.81l-7.522 9.618Z"
      />
      <path
        fill="#3ECF8E"
        d="M10.4 2.367c.498-.638 1.508-.289 1.52.525l.077 11.903H4.214c-1.428 0-2.224-1.674-1.337-2.81L10.4 2.367Z"
      />
    </g>
    <defs>
      <linearGradient
        id="Supabase_svg__b"
        x1={11.908}
        x2={18.945}
        y1={11.73}
        y2={14.637}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#249361" />
        <stop offset={1} stopColor="#3ECF8E" />
      </linearGradient>
      <linearGradient
        id="Supabase_svg__c"
        x1={8.802}
        x2={12.074}
        y1={7.412}
        y2={13.477}
        gradientUnits="userSpaceOnUse"
      >
        <stop />
        <stop offset={1} stopOpacity={0} />
      </linearGradient>
      <clipPath id="Supabase_svg__a">
        <path fill="#fff" d="M2.5 2h19v20h-19z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgSupabase;
