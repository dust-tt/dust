import type { Space } from "./types";

export const mockSpaces: Space[] = [
  {
    id: "space-1",
    name: "Company",
    description: "Company-wide space for all employees and general discussions",
  },
  {
    id: "space-2",
    name: "Engineering",
<<<<<<< HEAD
    description: "Engineering team space for technical discussions and code reviews",
  },
  {
    id: "space-3",
    name: "Design",
<<<<<<< HEAD
    description: "Design team workspace for creative collaboration and design reviews",
  },
  {
    id: "space-4",
    name: "Product",
<<<<<<< HEAD
    description: "Product team space for roadmap planning and feature discussions",
  },
  {
    id: "space-5",
    name: "Series C",
    description: "Fundraising and investor relations for Series C round",
  },
  {
    id: "space-6",
    name: "Product v3",
    description: "Development and planning for Product v3 major release",
  },
  {
    id: "space-7",
    name: "New Onboarding",
<<<<<<< HEAD
    description: "Resources and discussions for new employee onboarding program",
  },
  {
    id: "space-8",
    name: "Sales",
<<<<<<< HEAD
    description: "Sales team space for deals, pipeline, and customer relationships",
  },
  {
    id: "space-9",
    name: "Marketing",
    description: "Marketing team workspace for campaigns and brand strategy",
  },
  {
    id: "space-10",
    name: "Q4 Launch",
    description: "Cross-functional project space for Q4 product launch",
  },
  {
    id: "space-11",
    name: "Customer Success",
<<<<<<< HEAD
    description: "Customer success team space for support and account management",
  },
  {
    id: "space-12",
    name: "Mobile App Redesign",
    description: "Project space for mobile application redesign initiative",
  },
  {
    id: "space-13",
    name: "Data & Analytics",
    description: "Data team workspace for analytics, reporting, and insights",
  },
  {
    id: "space-14",
    name: "Security & Compliance",
<<<<<<< HEAD
    description: "Security team space for compliance, audits, and security initiatives",
  },
  {
    id: "space-15",
    name: "Infrastructure Migration",
    description: "Engineering project for cloud infrastructure migration",
  },
  {
    id: "space-16",
    name: "HR & People Ops",
    description: "Human resources and people operations team space",
  },
  {
    id: "space-17",
    name: "API v2",
<<<<<<< HEAD
    description: "Development space for API version 2 redesign and implementation",
  },
  {
    id: "space-18",
    name: "Content Marketing",
<<<<<<< HEAD
    description: "Content team workspace for blog posts, documentation, and content strategy",
  },
  {
    id: "space-19",
    name: "Platform Team",
<<<<<<< HEAD
    description: "Platform engineering team space for infrastructure and tooling",
  },
  {
    id: "space-20",
    name: "Enterprise Sales",
<<<<<<< HEAD
    description: "Enterprise sales team space for large deals and enterprise accounts",
  },
  {
    id: "space-21",
    name: "International Expansion",
    description: "Cross-functional project for international market expansion",
  },
  {
    id: "space-22",
    name: "UX Research",
<<<<<<< HEAD
    description: "User experience research team space for user studies and insights",
  },
  {
    id: "space-23",
    name: "DevOps",
    description: "DevOps team workspace for CI/CD, monitoring, and deployment",
  },
  {
    id: "space-24",
    name: "Brand Refresh",
    description: "Marketing project for company brand refresh and rebranding",
  },
  {
    id: "space-25",
    name: "Frontend Team",
    description: "Frontend engineering team space for UI/UX implementation",
  },
  {
    id: "space-26",
    name: "Backend Team",
    description: "Backend engineering team space for services and APIs",
  },
  {
    id: "space-27",
    name: "Customer Onboarding 2.0",
<<<<<<< HEAD
    description: "Project to redesign and improve customer onboarding experience",
  },
  {
    id: "space-28",
    name: "AI/ML Initiatives",
<<<<<<< HEAD
    description: "Machine learning team space for AI features and model development",
  },
  {
    id: "space-29",
    name: "Partnerships",
    description: "Business development team space for strategic partnerships",
  },
  {
    id: "space-30",
    name: "Quality Assurance",
<<<<<<< HEAD
    description: "QA team workspace for testing, bug tracking, and quality initiatives",
  },
];

/**
 * Get a random selection of spaces
 * @param count - Number of spaces to return
 * @returns Array of randomly selected spaces
 */
export function getRandomSpaces(count: number): Space[] {
  const shuffled = [...mockSpaces].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, mockSpaces.length));
}

/**
 * Get a space by ID
 * @param id - Space ID
 * @returns Space or undefined if not found
 */
export function getSpaceById(id: string): Space | undefined {
  return mockSpaces.find((space) => space.id === id);
}

/**
 * Get spaces by IDs
 * @param ids - Array of space IDs
 * @returns Array of spaces matching the provided IDs
 */
export function getSpacesByIds(ids: string[]): Space[] {
  return mockSpaces.filter((space) => ids.includes(space.id));
}

