import type { SVGProps } from "react";
import * as React from "react";
const SvgGemini = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Gemini_svg__a)">
      <rect width={24} height={24} fill="#1B1E29" rx={4} />
      <path
        fill="url(#Gemini_svg__b)"
        d="M12 2c0 5.523 4.477 10 10 10-5.523 0-10 4.477-10 10 0-5.523-4.477-10-10-10 5.523 0 10-4.477 10-10Z"
      />
    </g>
    <defs>
      <radialGradient
        id="Gemini_svg__b"
        cx={0}
        cy={0}
        r={1}
        gradientTransform="rotate(135 10.586 5.556) scale(28.2843)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset={0.358} stopColor="#FADFBC" />
        <stop offset={0.836} stopColor="#3972F4" />
      </radialGradient>
      <clipPath id="Gemini_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgGemini;
