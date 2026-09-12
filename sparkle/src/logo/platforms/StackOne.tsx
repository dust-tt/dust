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
    <g transform="translate(0 5)scale(.12)">
      <path
        fill="url(#StackOne_svg__a)"
        d="M66.666 38.889h66.667V0h-31.845C82.256 0 66.666 0 66.666 20.392z"
      />
      <path
        fill="url(#StackOne_svg__b)"
        d="M133.333 77.777H66.666v38.889h31.845c19.231 0 34.822 0 34.822-20.392z"
      />
      <path
        fill="#00AF66"
        d="M133.333 0H66.889 0L0 77.778h66.889V38.896l-.01-1.647C66.762 16.711 83.378 0 103.916 0z"
      />
      <path
        fill="#00AF66"
        d="M66.666 116.666H133.11 199.999V38.889H133.11v38.882l.01 1.647c.117 20.538-16.499 37.248-37.037 37.248z"
      />
    </g>
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
