import type { SVGProps } from "react";
import * as React from "react";

const SvgFathom = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Fathom_svg__a)">
      <rect width={24} height={24} fill="#000" rx={6} />
      <path
        fill="#00BEFF"
        d="M17.2 13.287 6.8 7.6c-.972-.571-1.286-1.686-.714-2.658.571-.885 1.771-1.2 2.714-.714l10.402 5.687c.972.571 1.286 1.686.714 2.629-.457.971-1.743 1.286-2.714.743m-4.8 3.429-5.515-3.03c-.972-.57-1.286-1.685-.715-2.628.572-.886 1.772-1.2 2.715-.715l5.515 3.058c.972.572 1.286 1.686.715 2.629-.543.857-1.744 1.172-2.715.686"
      />
      <path
        fill="#00BEFF"
        d="M5.827 18.002v-5.915c0-1.115.886-2 2-2 1.115 0 2.001.885 2.001 2v5.915c0 1.114-.886 2-2 2-1.115 0-2-.886-2-2"
        opacity={0.5}
      />
    </g>
    <defs>
      <clipPath id="Fathom_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgFathom;
