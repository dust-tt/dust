import type { SVGProps } from "react";
import * as React from "react";

const SvgSlab = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Slab_svg__a)">
      <mask
        id="Slab_svg__b"
        width={20}
        height={20}
        x={2}
        y={2}
        maskUnits="userSpaceOnUse"
        style={{
          maskType: "luminance",
        }}
      >
        <path fill="#fff" d="M2 2h20v20H2z" />
      </mask>
      <g fillRule="evenodd" clipRule="evenodd" mask="url(#Slab_svg__b)">
        <path
          fill="#50C5DC"
          d="M11.994 8.625h10V6.709c0-2.6-2.238-4.709-5-4.709H7.29c2.618.15 4.703 6.625 4.703 6.625"
        />
        <path
          fill="#FCB415"
          d="M12 12H2V6.888C2 4.188 4.238 2 7 2h9.703c-2.618.156-4.72 2.279-4.72 4.876z"
        />
        <path
          fill="#741448"
          d="M12.006 15.475h-10v1.916c0 2.6 2.238 4.709 5 4.709h9.703c-2.619-.15-4.703-6.625-4.703-6.625"
        />
        <path
          fill="#FF4143"
          d="M12 12h10v5.113c0 2.7-2.238 4.887-5 4.887H7.297c2.618-.156 4.72-2.279 4.72-4.876z"
        />
        <path
          fill="#fff"
          d="M3.938 10.155h6.106V9.34H3.937zm0-1.857h6.106v-.816H3.937zm0-1.858h6.106v-.815H3.937zm9.974 8.25h6.107v-.815h-6.106zm0 1.858h6.107v-.815h-6.106zm0 1.857h6.107v-.815h-6.106z"
        />
      </g>
    </g>
    <defs>
      <clipPath id="Slab_svg__a">
        <path fill="#fff" d="M2 2h20v20H2z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgSlab;
