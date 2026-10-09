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
        d="M13.69 22.471c-.525.701-1.59.317-1.602-.578L11.903 8.8h8.298c1.502 0 2.34 1.842 1.406 3.09z"
      />
      <path
        fill="url(#Supabase_svg__c)"
        fillOpacity={0.2}
        d="M13.69 22.471c-.525.701-1.59.317-1.602-.578L11.903 8.8h8.298c1.502 0 2.34 1.842 1.406 3.09z"
      />
      <path
        fill="#3ECF8E"
        d="M10.315 1.403c.525-.7 1.589-.317 1.601.578l.081 13.094H3.804c-1.503 0-2.341-1.842-1.407-3.091z"
      />
    </g>
    <defs>
      <linearGradient
        id="Supabase_svg__b"
        x1={11.903}
        x2={19.403}
        y1={11.703}
        y2={14.667}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#249361" />
        <stop offset={1} stopColor="#3ECF8E" />
      </linearGradient>
      <linearGradient
        id="Supabase_svg__c"
        x1={8.634}
        x2={12.318}
        y1={6.953}
        y2={13.489}
        gradientUnits="userSpaceOnUse"
      >
        <stop />
        <stop offset={1} stopOpacity={0} />
      </linearGradient>
      <clipPath id="Supabase_svg__a">
        <path fill="#fff" d="M2 1h20v22H2z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgSupabase;
