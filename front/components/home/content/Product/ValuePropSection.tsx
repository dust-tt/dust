"use client";

import { Pointer } from "@app/components/magicui/pointer";

import { H3, P } from "../../ContentComponents";

export function ValuePropSection() {
  return (
    <div className="container mx-auto px-4 sm:px-6">
      <div className="mb-8">
        {/* <H2>Amplify your team's performance</H2>*/}
        {/* <P size="lg" className="mt-6 text-muted-foreground">
          Anyone on your&nbsp;team can create personalized&nbsp;agents.
        </P> */}
      </div>

      <div className="flex flex-col gap-16">
        <div className="flex flex-col items-center gap-8 md:flex-row">
          <div className="order-1 w-full md:order-1 md:w-1/2">
            <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-golden-50">
              <img
                src="/static/landing/docexpert/docexpert.png"
                alt="DocExpert"
                className="h-full w-full object-contain"
              />
              <Pointer>
                <div className="text-2xl">✨</div>
              </Pointer>
            </div>
          </div>
          <div className="order-2 w-full md:order-2 md:w-1/2">
            <div className="flex flex-col gap-3">
              <H3 className="text-foreground">
                Create AI Agents in seconds<br></br>
              </H3>
              <P size="md" className="text-muted-foreground">
                Build powerful AI agents without code. Connect them to your
                <br></br>
                company data, customize their capabilities, and deploy them in
                <br></br>
                minutes.
              </P>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-8 md:flex-row">
          <div className="order-1 w-full md:order-2 md:w-1/2">
            <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-blue-50">
              <img
                src="/static/landing/code/code.png"
                alt="Platform Integration"
                className="h-full w-full object-contain"
              />
              <Pointer>
                <div className="text-2xl">🔗</div>
              </Pointer>
            </div>
          </div>
          <div className="order-2 w-full md:order-1 md:w-1/2">
            <div className="flex flex-col gap-3">
              <H3 className="text-foreground">
                Connect all your data easily&nbsp;and securely
              </H3>
              <P size="md" className="text-muted-foreground">
                Bring your company knowledge together from Slack, Google Drive,
                <br></br>
                Notion, Confluence, GitHub and more. Your data stays private and
                <br></br>
                secure.
              </P>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-8 md:flex-row">
          <div className="order-1 w-full md:order-1 md:w-1/2">
            <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-rose-50">
              <img
                src="/static/landing/analysis/analysis.png"
                alt="Analysis"
                className="h-full w-full object-contain"
              />
              <Pointer>
                <div className="text-2xl">🧠</div>
              </Pointer>
            </div>
          </div>
          <div className="order-2 w-full md:order-2 md:w-1/2">
            <div className="flex flex-col gap-3">
              <H3 className="text-foreground">Go beyond search and chat</H3>
              <P size="md" className="text-muted-foreground">
                Dust agents can use multiple tools to solve complex problems:
                <br></br>
                semantic search, data analysis, web navigation, and more - all
                <br></br>
                in one workspace.
              </P>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
