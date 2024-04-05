import { Avatar, Div3D, Hover3D } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import React from "react";

import {
  Grid,
  H2,
  H3,
  H4,
  H5,
  P,
} from "@app/components/home/components/contentComponents";
import { classNames } from "@app/lib/utils";

interface ImgBlockProps {
  children?: React.ReactNode;
  title: React.ReactNode;
  content: React.ReactNode;
}

export const ImgBlock: React.FC<ImgBlockProps> = ({
  children,
  title,
  content,
}) => {
  return (
    <div className="col-span-4 flex flex-col gap-6">
      {children ? children : null}
      <H4 className="text-white">{title}</H4>
      <P size="sm">{content}</P>
    </div>
  );
};

interface BlogBlockProps {
  children?: React.ReactNode;
  title: React.ReactNode;
  content: React.ReactNode;
  href: string;
}

export const BlogBlock: React.FC<BlogBlockProps> = ({
  children,
  title,
  content,
  href,
}) => {
  return (
    <a
      href={href}
      target="_blank"
      className={classNames(
        "col-span-4 flex flex-col overflow-hidden rounded-2xl bg-slate-100 drop-shadow-xl",
        "group transition duration-300 ease-out",
        "hover:scale-105 hover:bg-white"
      )}
    >
      {children ? (
        <div className="relative aspect-video overflow-hidden rounded-t-xl">
          {React.Children.map(children, (child) => {
            if (
              React.isValidElement<React.ImgHTMLAttributes<HTMLImageElement>>(
                child
              ) &&
              child.type === "img"
            ) {
              return React.cloneElement(child, {
                className:
                  "absolute h-full w-full object-cover brightness-100 transition duration-300 ease-out group-hover:brightness-110 border border-slate-900/10 rounded-t-2xl",
              });
            }
            return child;
          })}
        </div>
      ) : null}
      <div className="flex flex-col gap-3 p-6">
        <H5 className="text-slate-900">{title}</H5>
        <P size="xs" className="text-slate-900">
          {content}
        </P>
      </div>
    </a>
  );
};

interface HeaderContentBlockProps {
  title: ReactNode;
  subtitle: ReactNode;
  uptitle: string;
  from: string;
  to: string;
}

export const HeaderContentBlock = ({
  title,
  subtitle,
  uptitle,
  from,
  to,
}: HeaderContentBlockProps) => (
  <Grid>
    <div
      className={classNames(
        "flex min-h-[36vh] flex-col justify-end gap-8",
        "col-span-12",
        "lg:col-span-10 lg:col-start-2",
        "xl:col-span-9 xl:col-start-2",
        "2xl:col-start-3"
      )}
    >
      <P size="lg" className="text-slate-500">
        {uptitle}
      </P>
      <div className="h-4" />
      <H2 from={from} to={to}>
        {title}
      </H2>
      <H3 className="text-white">{subtitle}</H3>
    </div>
  </Grid>
);

interface BlockProps {
  children: ReactNode;
  title: string;
  color: "pink" | "sky" | "emerald" | "amber";
  className?: string;
}

const blockColors = {
  pink: { block: "bg-pink-300", title: "text-pink-700" },
  sky: { block: "bg-sky-300", title: "text-sky-700" },
  emerald: { block: "bg-emerald-300", title: "text-emerald-700" },
  amber: { block: "bg-amber-300", title: "text-amber-700" },
};

export const Block = ({
  children,
  title,
  color,
  className = "",
}: BlockProps) => {
  return (
    <div
      className={classNames(
        className,
        "flex flex-col gap-3 rounded-2xl border border-white/10 p-6  pb-8",
        blockColors[color].block
      )}
    >
      <H4 className={blockColors[color].title}>{title}</H4>
      <P size="sm" className="text-slate-900">
        {children}
      </P>
    </div>
  );
};

interface ConversationProps {
  children: ReactNode;
}

export const Conversation = ({ children }: ConversationProps) => {
  return <div className="flex flex-col gap-4">{children}</div>;
};

interface MessageProps {
  children: ReactNode;
  visual: string;
  type: "user" | "agent";
  name: string;
}

const typeClasses = {
  user: {
    block: "rounded-2xl bg-slate-700/50 mr-20",
    label: " text-slate-200",
  },
  agent: {
    block: "ml-20 rounded-2xl bg-sky-700/50",
    label: "text-slate-200",
  },
};

export const Message = ({ children, visual, type, name }: MessageProps) => {
  return (
    <div
      className={classNames(
        "flex w-full flex-col gap-4 border border-white/10 p-6 pb-8 backdrop-blur-lg",
        typeClasses[type].block
      )}
    >
      <div className="flex items-center gap-4">
        <Avatar size="md" name={name} visual={visual} />
        <div
          className={classNames(
            "text-base font-semibold",
            typeClasses[type].label
          )}
        >
          {name}
        </div>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
};

interface MessageHandleProps {
  children: ReactNode;
}

export const Handle = ({ children }: MessageHandleProps) => {
  return <span className="font-semibold text-emerald-400">{children}</span>;
};

interface ContentAssistantProps {
  content: ReactNode;
  assistant: ReactNode;
  color: "pink" | "sky" | "emerald" | "amber";
  className?: string;
}

const assistantColor = {
  pink: "from-pink-200 to-pink-300",
  sky: "from-sky-200 to-sky-300",
  emerald: "from-emerald-200 to-emerald-300",
  amber: "from-amber-200 to-amber-300",
};

export const ContentAssistantBlock = ({
  content,
  assistant,
  color,
  className = "",
}: ContentAssistantProps) => {
  return (
    <div
      className={classNames(
        className,
        "overflow-hidden rounded-[28px] bg-slate-50"
      )}
    >
      <div className="flex flex-row gap-8 p-8">{content}</div>
      <div
        className={classNames(
          "p-8l flex flex-row gap-8 border border-slate-800/10 bg-gradient-to-br",
          assistantColor[color]
        )}
      >
        {assistant}
      </div>
    </div>
  );
};

interface Bloc2Props {
  children: ReactNode;
  title: ReactNode;
  className?: string;
}

export const Block2 = ({ children, title, className = "" }: Bloc2Props) => {
  return (
    <div className={classNames(className, "flex grow basis-0 flex-col gap-3")}>
      <H4 className="text-slate-900">{title}</H4>
      <P size="sm" className="text-slate-600">
        {children}
      </P>
    </div>
  );
};

export const DroidItem = ({
  name,
  question,
  avatar,
  className = "",
}: {
  name: string;
  question: string;
  avatar: {
    visual: string;
    background: string;
  };
  className?: string;
}) => {
  return (
    <div className={classNames("flex w-full flex-col gap-2 p-8", className)}>
      <Hover3D className="relative h-20 w-20 ">
        <Div3D depth={-10}>
          <div
            className="h-20 w-20 rounded-3xl border border-slate-900/20"
            style={{ background: avatar.background }}
          />
        </Div3D>
        <Div3D depth={30} className="absolute top-0 h-20 w-20">
          <img
            src="./static/landing/droids/Droid_Shadow.png"
            className="h-20 w-20"
          />
        </Div3D>
        <Div3D depth={50} className="absolute top-0 h-20 w-20">
          <img src={avatar.visual} className="h-20 w-20" />
        </Div3D>
      </Hover3D>
      <H4 className="truncate text-slate-900">{name}</H4>
      <P size="sm" className="text-slate-700">
        {question}
      </P>
    </div>
  );
};

export const Avatars3D = {
  "1": {
    background:
      "linear-gradient(180deg, rgba(218,188,125,1) 0%, rgba(184,142,72,1) 72%, rgba(115,93,58,1) 73%, rgba(220,191,143,1) 74%, rgba(223,198,159,1) 100%)",
    visual: "./static/landing/droids/Droid_Cream_7.png",
  },
  "2": {
    background:
      "linear-gradient(180deg, rgba(180,157,87,1) 0%, rgba(159,134,61,1) 72%, rgba(105,85,38,1) 73%, rgba(196,173,98,1) 74%, rgba(158,136,71,1) 100%)",
    visual: "./static/landing/droids/Droid_Green_4.png",
  },
  "3": {
    background:
      "linear-gradient(180deg, rgba(196,208,217,1) 0%, rgba(174,186,194,1) 72%, rgba(89,92,98,1) 73%, rgba(210,202,196,1) 74%, rgba(199,188,180,1) 100%)",
    visual: "./static/landing/droids/Droid_Sky_8.png",
  },
  "4": {
    background:
      "linear-gradient(180deg, rgba(233,230,225,1) 0%, rgba(217,205,201,1) 72%, rgba(170,120,140,1) 73%, rgba(230,221,215,1) 74%, rgba(215,210,205,1) 100%)",
    visual: "./static/landing/droids/Droid_Orange_6.png",
  },
  "5": {
    background:
      "linear-gradient(180deg, rgba(193,184,173,1) 0%, rgba(193,183,172,1) 72%, rgba(124,95,72,1) 73%, rgba(207,197,187,1) 74%, rgba(215,210,205,1) 100%)",
    visual: "./static/landing/droids/Droid_Yellow_4.png",
  },
  "6": {
    background:
      "linear-gradient(180deg, rgba(233,230,225,1) 0%, rgba(217,205,201,1) 72%, rgba(170,120,140,1) 73%, rgba(230,221,215,1) 74%, rgba(215,210,205,1) 100%)",
    visual: "./static/landing/droids/Droid_Pink_6.png",
  },
  "7": {
    background:
      "linear-gradient(180deg, rgba(125,154,148,1) 0%, rgba(78,111,107,1) 72%, rgba(52,74,71,1) 73%, rgba(136,169,164,1) 74%, rgba(152,178,172,1) 100%)",
    visual: "./static/landing/droids/Droid_Teal_5.png",
  },
  "8": {
    background:
      "linear-gradient(180deg, rgba(164,159,142,1) 0%, rgba(185,179,163,1) 72%, rgba(113,105,94,1) 73%, rgba(221,215,199,1) 74%, rgba(217,213,200,1) 100%)",
    visual: "./static/landing/droids/Droid_Sky_4.png",
  },
  "9": {
    background:
      "linear-gradient(180deg, rgba(215,189,176,1) 0%, rgba(173,136,115,1) 72%, rgba(127,62,45,1) 73%, rgba(225,204,190,1) 74%, rgba(222,200,184,1) 100%)",
    visual: "./static/landing/droids/Droid_Red_5.png",
  },
};
