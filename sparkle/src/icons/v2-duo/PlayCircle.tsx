import type { SVGProps } from "react";
import * as React from "react";

const SvgPlayCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#play-circle_svg__a)">
      <path
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m2.07 0c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
        opacity={0.4}
      />
      <path d="M9.89 6.885c.379-.027.683.114.848.2.174.09.37.22.554.337l4.72 3.035c.158.1.337.214.477.324.124.096.312.258.447.508l.053.114.053.145c.106.344.088.715-.053 1.05a1.6 1.6 0 0 1-.5.621c-.14.11-.319.223-.476.324l-4.721 3.036c-.183.117-.38.245-.554.335-.165.086-.47.229-.847.202a1.54 1.54 0 0 1-1.12-.612c-.227-.303-.273-.636-.29-.82-.017-.195-.016-.431-.016-.65V8.966c0-.218-.001-.454.016-.648.018-.186.064-.518.29-.821l.107-.127a1.54 1.54 0 0 1 1.013-.484m.645 7.719L14.585 12l-4.05-2.604z" />
    </g>
    <defs>
      <clipPath id="play-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgPlayCircle;
