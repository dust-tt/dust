import type { SVGProps } from "react";
import * as React from "react";
const SvgJira = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
    width="1em"
    height="1em"
    preserveAspectRatio="xMidYMid"
    viewBox="0 -30.632 255.324 285.956"
    {...props}
  >
    <linearGradient id="jira_svg__a">
      <stop offset={0.18} stopColor="#0052cc" />
      <stop offset={1} stopColor="#2684ff" />
    </linearGradient>
    <linearGradient
      xlinkHref="#jira_svg__a"
      id="jira_svg__b"
      x1="98.031%"
      x2="58.888%"
      y1=".161%"
      y2="40.766%"
    />
    <linearGradient
      xlinkHref="#jira_svg__a"
      id="jira_svg__c"
      x1="100.665%"
      x2="55.402%"
      y1=".455%"
      y2="44.727%"
    />
    <path
      fill="#2684ff"
      d="M244.658 0H121.707a55.502 55.502 0 0 0 55.502 55.502h22.649V77.37c.02 30.625 24.841 55.447 55.466 55.467V10.666C255.324 4.777 250.55 0 244.658 0z"
    />
    <path
      fill="url(#jira_svg__b)"
      d="M183.822 61.262H60.872c.019 30.625 24.84 55.447 55.466 55.467h22.649v21.938c.039 30.625 24.877 55.43 55.502 55.43V71.93c0-5.891-4.776-10.667-10.667-10.667z"
    />
    <path
      fill="url(#jira_svg__c)"
      d="M122.951 122.489H0c0 30.653 24.85 55.502 55.502 55.502h22.72v21.867c.02 30.597 24.798 55.408 55.396 55.466V133.156c0-5.891-4.776-10.667-10.667-10.667z"
    />
  </svg>
);
export default SvgJira;
