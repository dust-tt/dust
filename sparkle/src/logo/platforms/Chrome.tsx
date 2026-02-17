import type { SVGProps } from "react";
import * as React from "react";

const SvgChrome = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Chrome_svg__a)">
      <path fill="#fff" d="M12 16.999a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
      <path
        fill="url(#Chrome_svg__b)"
        d="M7.67 14.5 3.34 7.001A9.998 9.998 0 0 0 12 22l4.33-7.499v-.001a4.999 4.999 0 0 1-8.66.001Z"
      />
      <path
        fill="url(#Chrome_svg__c)"
        d="M16.33 14.5 12 21.998A9.996 9.996 0 0 0 20.658 7H12a5 5 0 0 1 4.33 7.5Z"
      />
      <path
        fill="#1A73E8"
        d="M12 15.958a3.958 3.958 0 1 0 0-7.916 3.958 3.958 0 0 0 0 7.916Z"
      />
      <path
        fill="url(#Chrome_svg__d)"
        d="M12 7h8.659a9.998 9.998 0 0 0-17.319.001L7.67 14.5A5 5 0 0 1 12 7Z"
      />
    </g>
    <defs>
      <linearGradient
        id="Chrome_svg__b"
        x1={13.082}
        x2={4.423}
        y1={21.374}
        y2={6.376}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#1E8E3E" />
        <stop offset={1} stopColor="#34A853" />
      </linearGradient>
      <linearGradient
        id="Chrome_svg__c"
        x1={10.541}
        x2={19.2}
        y1={22.025}
        y2={7.027}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#FCC934" />
        <stop offset={1} stopColor="#FBBC04" />
      </linearGradient>
      <linearGradient
        id="Chrome_svg__d"
        x1={3.34}
        x2={20.659}
        y1={8.25}
        y2={8.25}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#D93025" />
        <stop offset={1} stopColor="#EA4335" />
      </linearGradient>
      <clipPath id="Chrome_svg__a">
        <path fill="#fff" d="M2 2h20v20H2z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgChrome;
