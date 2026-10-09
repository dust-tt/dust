import type { SVGProps } from "react";
import * as React from "react";

const SvgStackOne = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="url(#StackOne_svg__a)"
      d="M66.666 38.889h66.667V0h-31.845C82.256 0 66.666 0 66.666 20.392z"
      transform="matrix(.12 0 0 .12 0 5)"
    />
    <path
      fill="url(#StackOne_svg__b)"
      d="M133.333 77.777H66.666v38.889H98.51c19.232 0 34.823 0 34.823-20.392z"
      transform="matrix(.12 0 0 .12 0 5)"
    />
    <path
      fill="#00AF66"
      d="M16 5H0v9.333h8.027V9.668l-.001-.198A4.444 4.444 0 0 1 12.47 5zM8 19h16V9.667h-8.027v4.665l.001.198A4.444 4.444 0 0 1 11.53 19z"
    />
    <defs>
      <linearGradient
        id="StackOne_svg__a"
        x1={133.333}
        x2={66.666}
        y1={19.444}
        y2={19.444}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#00AF66" />
        <stop offset={1} stopColor="#285C4D" />
      </linearGradient>
      <linearGradient
        id="StackOne_svg__b"
        x1={66.666}
        x2={133.333}
        y1={97.222}
        y2={97.222}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#00AF66" />
        <stop offset={1} stopColor="#285C4D" />
      </linearGradient>
    </defs>
  </svg>
);
export default SvgStackOne;
