import * as React from "react";
import type { SVGProps } from "react";
const SvgClickUp = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 54.8 65.8"
    {...props}
  >
    <defs>
      <linearGradient
        id="ClickUp_svg__a"
        x1={0}
        x2={54.845}
        y1={54.311}
        y2={54.311}
        gradientUnits="userSpaceOnUse"
      >
        <stop offset={0} stopColor="#8930FD" />
        <stop offset={1} stopColor="#49CCF9" />
      </linearGradient>
      <linearGradient
        id="ClickUp_svg__b"
        x1={1.195}
        x2={53.745}
        y1={16.194}
        y2={16.194}
        gradientUnits="userSpaceOnUse"
      >
        <stop offset={0} stopColor="#FF02F0" />
        <stop offset={1} stopColor="#FFC800" />
      </linearGradient>
    </defs>
    <path
      fill="url(#ClickUp_svg__a)"
      fillRule="evenodd"
      d="M0 50.6l10.1-7.8c5.4 7 11.1 10.3 17.4 10.3 6.3 0 11.9-3.2 17-10.2l10.3 7.6c-7.4 10-16.6 15.3-27.3 15.3C16.9 65.8 7.6 60.5 0 50.6z"
      clipRule="evenodd"
    />
    <path
      fill="url(#ClickUp_svg__b)"
      fillRule="evenodd"
      d="M27.5 16.9l-18 15.5-8.3-9.7L27.6 0l26.2 22.7-8.4 9.6L27.5 16.9z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgClickUp;
