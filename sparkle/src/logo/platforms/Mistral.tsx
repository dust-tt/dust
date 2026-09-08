import type { SVGProps } from "react";
import * as React from "react";

const SvgMistral = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Mistral_svg__a)">
      <rect width={24} height={24} fill="#F5F4F0" rx={6} />
      <path
        fill="#1A1C20"
        d="M4 4.571h1.116v14.857H4zM15.907 13.486h1.116v5.943h-1.116zM12.93 7.543h1.116v2.971H12.93zM9.954 13.486h1.116v2.971H9.954zM15.907 4.571h1.116v2.971h-1.116z"
      />
      <path
        fill="#FFCD00"
        d="M5.116 4.571h2.977v2.971H5.116zM17.023 4.571H20v2.971h-2.977z"
      />
      <path
        fill="#FFA301"
        d="M5.116 7.543h2.977v2.971H5.116zM17.023 7.543H20v2.971h-2.977zM8.093 7.543h2.977v2.971H8.093zM14.046 7.543h2.977v2.971h-2.977z"
      />
      <path
        fill="#FF6F00"
        d="M5.116 10.514h2.977v2.971H5.116zM17.023 10.514H20v2.971h-2.977zM8.093 10.514h2.977v2.971H8.093zM14.046 10.514h2.977v2.971h-2.977z"
      />
      <path fill="#FF6F00" d="M11.07 10.514h2.977v2.971H11.07z" />
      <path
        fill="#FF4606"
        d="M5.116 13.486h2.977v2.971H5.116zM17.023 13.486H20v2.971h-2.977zM11.07 13.486h2.977v2.971H11.07z"
      />
      <path
        fill="#FF0107"
        d="M5.116 16.457h2.977v2.971H5.116zM17.023 16.457H20v2.971h-2.977z"
      />
    </g>
    <defs>
      <clipPath id="Mistral_svg__a">
        <rect width={24} height={24} fill="#fff" rx={4} />
      </clipPath>
    </defs>
  </svg>
);
export default SvgMistral;
