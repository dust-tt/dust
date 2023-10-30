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
    <path
      fill="#1A1C20"
      d="M4 4h1.125v15H4zM16 13h1.125v6H16zM13 7h1.125v3H13zM10 13h1.125v3H10zM16 4h1.125v3H16z"
    />
    <path fill="#FFCD00" d="M5.125 4h3v3h-3zM17.125 4h3v3h-3z" />
    <path
      fill="#FFA301"
      d="M5.125 7h3v3h-3zM17.125 7h3v3h-3zM8.125 7h3v3h-3zM14.125 7h3v3h-3z"
    />
    <path
      fill="#FF6F00"
      d="M5.125 10h3v3h-3zM17.125 10h3v3h-3zM8.125 10h3v3h-3zM14.125 10h3v3h-3zM11.125 10h3v3h-3z"
    />
    <path
      fill="#FF4606"
      d="M5.125 13h3v3h-3zM17.125 13h3v3h-3zM11.125 13h3v3h-3z"
    />
    <path fill="#FF0107" d="M5.125 16h3v3h-3zM17.125 16h3v3h-3z" />
  </svg>
);
export default SvgMistral;
