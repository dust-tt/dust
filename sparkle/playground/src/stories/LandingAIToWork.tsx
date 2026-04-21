import { useRef, useState } from "react";

type ConversationMessage = {
  role: "user" | "ai";
  text: string;
};

type Portrait = {
  id: number;
  title: string;
  name: string;
  image: string;
  video?: string;
  conversation: ConversationMessage[];
};

const PORTRAITS: Portrait[] = [
  {
    id: 1,
    title: "CEO",
    name: "Marc",
    image: "/landing/p1_ceo.png",
    video: "/landing/portrait_video_1.mp4",
    conversation: [
      { role: "user", text: "Summarise last week's board updates." },
      {
        role: "ai",
        text: "Revenue up 12%. Hiring plan approved. Three open risks flagged.",
      },
      { role: "user", text: "Draft a reply to the investors." },
      { role: "ai", text: "On it — drafting now." },
    ],
  },
  {
    id: 2,
    title: "Lead Mission Scientist",
    name: "Sophie",
    image: "/landing/p2_lead_scientist.png",
    conversation: [
      { role: "user", text: "Any anomalies in this morning's sensor data?" },
      {
        role: "ai",
        text: "One outlier in sector 4 — likely calibration drift.",
      },
      { role: "user", text: "Flag it for review and update the log." },
      { role: "ai", text: "Done. Log updated, team notified." },
    ],
  },
  {
    id: 3,
    title: "Sales Director",
    name: "Carlos",
    image: "/landing/p3_sales_director.png",
    conversation: [
      { role: "user", text: "Which deals are at risk this quarter?" },
      { role: "ai", text: "Three accounts — Acme, Brightline, and Nortek." },
      { role: "user", text: "Prepare a call brief for Acme." },
      { role: "ai", text: "Brief ready. Key pain point: onboarding delays." },
    ],
  },
  {
    id: 4,
    title: "Communications Officer",
    name: "James",
    image: "/landing/p4_comms_officer.png",
    conversation: [
      { role: "user", text: "Draft the press release for the product launch." },
      {
        role: "ai",
        text: "Draft done — leading with the sustainability angle.",
      },
      { role: "user", text: "Make it punchier. Cut 30%." },
      { role: "ai", text: "Trimmed. 280 words, headline sharpened." },
    ],
  },
  {
    id: 5,
    title: "CTO",
    name: "Elena",
    image: "/landing/p5_cto.png",
    conversation: [
      { role: "user", text: "What's our infra cost trend this month?" },
      { role: "ai", text: "Up 8% — driven by the new ML pipeline cluster." },
      { role: "user", text: "Model three cost reduction scenarios." },
      { role: "ai", text: "Scenarios ready. Spot instances save the most." },
    ],
  },
  {
    id: 6,
    title: "CFO",
    name: "Richard",
    image: "/landing/p6_cfo.png",
    conversation: [
      { role: "user", text: "How are we tracking vs. Q2 budget?" },
      { role: "ai", text: "3% under on opex, 7% over on headcount." },
      { role: "user", text: "Prepare a reforecast memo for the board." },
      { role: "ai", text: "Memo drafted. Highlights the headcount variance." },
    ],
  },
  {
    id: 7,
    title: "Systems Engineer",
    name: "Tom",
    image: "/landing/p7_systems_engineer.png",
    conversation: [
      { role: "user", text: "Any alerts firing in prod right now?" },
      { role: "ai", text: "One: elevated p99 latency on the auth service." },
      { role: "user", text: "Root cause and suggested fix?" },
      {
        role: "ai",
        text: "Connection pool saturation. Increase limit to 200.",
      },
    ],
  },
  {
    id: 8,
    title: "Data Analyst",
    name: "Yuki",
    image: "/landing/p8_data_analyst.png",
    conversation: [
      { role: "user", text: "Why did DAU drop 15% last Tuesday?" },
      {
        role: "ai",
        text: "Correlates with the push notification outage — 9am to 2pm.",
      },
      { role: "user", text: "Build a recovery timeline chart." },
      { role: "ai", text: "Chart ready — recovery complete by Thursday." },
    ],
  },
  {
    id: 9,
    title: "Account Executive",
    name: "Claire",
    image: "/landing/p9_account_executive.png",
    conversation: [
      { role: "user", text: "Prep me for my Acme call in 10 minutes." },
      {
        role: "ai",
        text: "Last touchpoint: demo 3 weeks ago. Pain: slow ROI.",
      },
      { role: "user", text: "What's the best angle to push today?" },
      {
        role: "ai",
        text: "Lead with the new automation module — halves setup time.",
      },
    ],
  },
  {
    id: 10,
    title: "Marketing Manager",
    name: "Zoé",
    image: "/landing/p10_marketing_manager.png",
    conversation: [
      {
        role: "user",
        text: "Which campaign drove the most signups last week?",
      },
      { role: "ai", text: "LinkedIn retargeting — 340 signups, CPA $18." },
      { role: "user", text: "Double the budget on that one." },
      { role: "ai", text: "Done. Projected 680 signups next week." },
    ],
  },
  {
    id: 11,
    title: "Customer Support Specialist",
    name: "Nina",
    image: "/landing/p11_customer_support.png",
    conversation: [
      { role: "user", text: "What's the top issue in today's tickets?" },
      { role: "ai", text: "Export failures — 34 tickets in the last 6 hours." },
      { role: "user", text: "Draft a status update for affected users." },
      { role: "ai", text: "Draft ready. Empathetic tone, ETA in 2 hours." },
    ],
  },
  {
    id: 12,
    title: "HR Manager",
    name: "Anne",
    image: "/landing/p12_hr_manager.png",
    conversation: [
      { role: "user", text: "How many open roles are past 30 days?" },
      { role: "ai", text: "Seven — three in engineering, two in sales." },
      {
        role: "user",
        text: "Draft a message to hiring managers to review pipelines.",
      },
      { role: "ai", text: "Message drafted. Friendly nudge, no blame." },
    ],
  },
];

function PortraitCard({ portrait }: { portrait: Portrait }) {
  const [hovered, setHovered] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleMouseEnter = () => {
    setHovered(true);
    if (portrait.video && videoRef.current) {
      videoRef.current.play();
    }
  };

  const handleMouseLeave = () => {
    setHovered(false);
    if (portrait.video && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={cardRef}
      className="s-relative s-overflow-hidden s-rounded-2xl s-cursor-none"
      style={{ aspectRatio: "1 / 1" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {/* Static image — always rendered */}
      <img
        src={portrait.image}
        alt={portrait.name}
        className="s-absolute s-inset-0 s-h-full s-w-full s-object-cover s-transition-opacity s-duration-300"
        style={{ opacity: portrait.video && hovered ? 0 : 1 }}
      />

      {/* Video — only for cards that have one */}
      {portrait.video && (
        <video
          ref={videoRef}
          src={portrait.video}
          loop
          muted
          playsInline
          className="s-absolute s-inset-0 s-h-full s-w-full s-object-cover s-transition-opacity s-duration-300"
          style={{ opacity: hovered ? 1 : 0 }}
        />
      )}

      {/* Name + title badge — bottom of card */}
      <div className="s-absolute s-bottom-0 s-left-0 s-right-0 s-bg-gradient-to-t s-from-black/70 s-to-transparent s-px-3 s-pb-3 s-pt-8">
        <p className="s-text-xs s-font-semibold s-uppercase s-tracking-wider s-text-white/60">
          {portrait.title}
        </p>
        <p className="s-text-sm s-font-semibold s-text-white">
          {portrait.name}
        </p>
      </div>

      {/* Cursor-following activity label */}
      {hovered && (
        <div
          className="s-pointer-events-none s-absolute s-z-10 s-whitespace-nowrap s-rounded-full s-bg-white/20 s-px-4 s-py-1.5 s-text-sm s-font-medium s-text-white s-ring-1 s-ring-white/30 s-backdrop-blur-sm"
          style={{
            left: cursorPos.x,
            top: cursorPos.y,
            transform: "translate(12px, -50%)",
          }}
        >
          Activity
        </div>
      )}
    </div>
  );
}

export default function LandingAIToWork() {
  return (
    <div className="s-flex s-min-h-screen s-flex-col s-items-center s-justify-center s-bg-slate-950 s-px-8 s-py-16">
      <div className="s-mb-12 s-text-center">
        <h2 className="s-text-4xl s-font-bold s-tracking-tight s-text-white">
          AI to work together
        </h2>
        <p className="s-mt-3 s-text-base s-text-slate-400">
          Every person, their own AI. Every team, moving faster.
        </p>
      </div>

      <div
        className="s-w-full s-max-w-4xl"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
        }}
      >
        {PORTRAITS.map((portrait) => (
          <PortraitCard key={portrait.id} portrait={portrait} />
        ))}
      </div>
    </div>
  );
}
