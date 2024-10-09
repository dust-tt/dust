import type { Meta } from "@storybook/react";
import React, { useEffect, useState } from "react";

import { ScrollBar } from "@sparkle/components/ScrollArea";

import {
  NewNavigationList,
  NewNavigationListItem,
  NewNavigationListLabel,
  ScrollArea,
} from "../index_with_tw_base";

const meta = {
  title: "NewPrimitives/NavigationList",
} satisfies Meta;

export default meta;

const getRandomTitles = (count: number) => {
  const shuffled = fakeTitles.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

export const NewNavigationListDemo = () => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [conversationTitles, setConversationTitles] = useState<
    { label: string; items: string[] }[]
  >([]);

  useEffect(() => {
    // Generate random titles for each date section only once
    setConversationTitles([
      { label: "Today", items: getRandomTitles(5) },
      { label: "Yesterday", items: getRandomTitles(10) },
    ]);
    console.log(conversationTitles); // Add this line
  }, []);

  // Flatten the items array to easily manage indices
  const allItems = conversationTitles.flatMap((section) => section.items);

  return (
    <div className="s-h-[400px] s-w-[200px] s-py-12">
      <ScrollArea>
        <NewNavigationList className="s-w-full">
          {conversationTitles.map((section, sectionIndex) => (
            <React.Fragment key={sectionIndex}>
              <NewNavigationListLabel>{section.label}</NewNavigationListLabel>
              {section.items.map((title, index) => {
                const itemIndex = allItems.indexOf(title); // Calculate the global index
                return (
                  <NewNavigationListItem
                    key={index}
                    selected={itemIndex === selectedIndex}
                    onClick={() => setSelectedIndex(itemIndex)}
                    label={title}
                    className="s-w-full"
                  />
                );
              })}
            </React.Fragment>
          ))}
        </NewNavigationList>
        <ScrollBar />
      </ScrollArea>
    </div>
  );
};

const fakeTitles = [
  "Project Kickoff Meeting",
  "Budget Review Discussion",
  "Weekly Sync with Team",
  "AI Bot Training Session",
  "Quarterly Planning Meeting",
  "Feedback on Latest Design",
  "Client Requirements Gathering",
  "Sprint Retrospective",
  "Daily Standup",
  "Marketing Strategy Planning",
  "Code Review Session",
  "Product Launch Preparation",
  "Onboarding New Team Members",
  "Customer Feedback Analysis",
  "Feature Prioritization Discussion",
  "Technical Debt Assessment",
  "Supply Chain Optimization",
  "Sales Performance Review",
  "Cross-Department Collaboration",
  "Innovation Brainstorming",
  "Risk Management Workshop",
  "Holiday Schedule Planning",
  "Compliance and Security Update",
  "UI/UX Design Critique",
  "End-of-Year Wrap Up",
  "Resource Allocation Meeting",
  "Vendor Negotiation Strategy",
  "Crisis Management Scenario",
  "SEO Best Practices Review",
  "New Hire Orientation",
  "Remote Work Policy Update",
  "Company Values Workshop",
  "Leadership Development Session",
  "Diversity and Inclusion Training",
  "Performance Improvement Plan",
  "Customer Success Story Sharing",
  "Community Engagement Strategy",
  "Internal Product Demo",
  "Cost Reduction Initiative",
  "Change Management Planning",
  "Employee Recognition Program",
  "IT Infrastructure Upgrade",
  "Content Marketing Planning",
  "Team Building Activities",
  "Data Privacy Compliance",
  "Board Meeting Preparation",
  "Investor Relations Update",
  "KPI Tracking and Reporting",
  "Industry Trends Analysis",
  "Partnership Opportunities Exploration",
  "Employee Wellness Program",
  "Talent Acquisition Strategy",
  "Brand Positioning Workshop",
  "Social Media Campaign Planning",
  "Competitive Analysis Review",
  "Legal Compliance Training",
  "Cybersecurity Awareness Session",
  "Cultural Exchange Program",
  "Product Roadmap Presentation",
  "Customer Journey Mapping",
  "Financial Forecasting Session",
  "Brand Storytelling Workshop",
  "AI Ethics and Governance Discussion",
  "Operational Efficiency Assessment",
  "Annual Report Drafting",
  "Project Milestone Celebration",
  "Quality Assurance Review",
  "Public Relations Strategy",
  "Team Performance Metrics",
  "Innovation Lab Tour",
  "Digital Transformation Roadmap",
  "Sustainability Initiatives Planning",
  "Internal Communications Strategy",
  "Customer Advisory Board Meeting",
  "Agile Methodology Training",
  "E-commerce Platform Update",
  "Risk Assessment and Mitigation",
  "Employee Satisfaction Survey Results",
  "Sales Funnel Optimization",
  "Cross-Cultural Communication Training",
  "Global Expansion Strategy",
  "Cloud Migration Plan",
  "Crisis Communication Strategy",
  "Webinar Content Creation",
  "Supply Chain Risk Management",
  "Data Analytics and Insights",
  "Customer Onboarding Process",
  "Brand Awareness Campaign",
  "Product Feature Request Review",
  "Annual Budget Allocation",
  "Employee Exit Interview",
  "User Feedback Session",
  "Strategic Partnership Negotiation",
  "Market Entry Strategy",
  "Employee Handbook Update",
  "Stakeholder Engagement Plan",
  "AI Chatbot Development",
  "Customer Retention Strategy",
  "Company Anniversary Celebration",
  "Leadership Team Offsite",
  "Innovation Challenge Kickoff",
  "Employee Benefits Review",
  "Business Continuity Planning",
];
