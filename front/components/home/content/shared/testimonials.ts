/**
 * Shared testimonial data used across landing pages.
 * Single source of truth for person info and quotes.
 *
 * When the same person has multiple quotes, they are stored as separate entries
 * (e.g. everettBerryImpact vs everettBerryAgents).
 */

export interface TestimonialData {
  quote: string;
  name: string;
  title: string;
  logo: string;
}

export const TESTIMONIALS = {
  danielBaralt: {
    quote:
      "We've reduced our response time by 73% and our team loves using it daily.",
    name: "Daniel Baralt",
    title: "AI Solutions Lead, GTM, Vanta",
    logo: "/static/landing/logos/gray/vanta.svg",
  },

  everettBerryImpact: {
    quote:
      "Dust is the most impactful software we've adopted since building Clay. It delivers immediate value while continuously getting smarter.",
    name: "Everett Berry",
    title: "Head of GTM Engineering at Clay",
    logo: "/static/landing/logos/gray/clay.svg",
  },

  everettBerryAgents: {
    quote:
      "I have Dust agents for vendor research, interviewing, and even to check changes in our knowledge base, endless possibilities with the platform.",
    name: "Everett Berry",
    title: "Head of GTM Engineering at Clay",
    logo: "/static/landing/logos/gray/clay.svg",
  },

  ryanWang: {
    quote:
      "Allows us to create qualitative deliverables, not only search/answer questions.",
    name: "Ryan Wang",
    title: "CEO, Assembled",
    logo: "/static/landing/logos/gray/assembled.svg",
  },

  inesDelbecq: {
    quote:
      "The data analyst job is dead. We'll only have business analysts now.",
    name: "Inès Delbecq",
    title: "AI Lead, Electra",
    logo: "/static/landing/logos/gray/electra.svg",
  },
} satisfies Record<string, TestimonialData>;
