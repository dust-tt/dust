import type { SVGProps } from "react";
import * as React from "react";

const SvgZapCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#zap-circle_svg__a)">
      <path
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m2.07 0c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
        opacity={0.4}
      />
      <path d="M11.147 4.914a1.036 1.036 0 0 1 1.888.586v3.965h2.944c.226 0 .468 0 .666.017.164.015.445.052.719.218l.117.08.128.11c.242.23.403.535.456.866l.018.168-.001.141c-.019.32-.148.573-.228.716-.097.174-.235.373-.363.559l-4.638 6.746a1.036 1.036 0 0 1-1.887-.586v-3.965H8.02c-.226 0-.467 0-.666-.017-.187-.018-.528-.063-.836-.298a1.53 1.53 0 0 1-.601-1.144c-.02-.387.136-.694.228-.857.098-.174.235-.373.362-.559zm-2.68 7.55H12c.571 0 1.035.464 1.035 1.036v1.668l2.498-3.633H12a1.035 1.035 0 0 1-1.034-1.035V8.831z" />
    </g>
    <defs>
      <clipPath id="zap-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgZapCircle;
