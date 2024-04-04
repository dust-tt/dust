import { Avatar } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import React from "react";

import { Grid, H2, H3, H4, P } from "@app/components/home/contentComponents";
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
    <div className="col-span-4 flex flex-col gap-4 p-4">
      {children ? children : null}
      <H4 className="text-white">{title}</H4>
      <P size="md">{content}</P>
    </div>
  );
};

interface HeaderContentBlockProps {
  title: ReactNode;
  subtitle: ReactNode;
  uptitle: string;
}

export const HeaderContentBlock = ({
  title,
  subtitle,
  uptitle,
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
      <H2>{title}</H2>
      <H3 className="text-white">{subtitle}</H3>
    </div>
  </Grid>
);

interface BlockProps {
  children: ReactNode;
  title: string;
  color: "pink" | "sky" | "emerald" | "amber";
}

const blockColors = {
  pink: { block: "bg-pink-300/80", title: "text-pink-800" },
  sky: { block: "bg-sky-300/80", title: "text-sky-800" },
  emerald: { block: "bg-emerald-300/80", title: "text-emerald-800" },
  amber: { block: "bg-amber-300/80", title: "text-amber-800" },
};

export const Block = ({ children, title, color }: BlockProps) => {
  return (
    <div>
      <div
        className={classNames(
          "flex flex-col gap-3 rounded-2xl border border-white/10 p-6  pb-8 backdrop-blur-md",
          blockColors[color].block
        )}
      >
        <H4 className={blockColors[color].title}>{title}</H4>
        <P size="sm" className="text-slate-900">
          {children}
        </P>
      </div>
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
