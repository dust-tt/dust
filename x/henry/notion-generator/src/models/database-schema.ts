export const DatabaseSchemas = {
  projectManagement: {
    name: "Project Management",
    minItems: 10,
    maxItems: 30,
    properties: {
      Name: { type: "title" },
      Status: {
        type: "status",
        options: [
          { name: "Not Started", color: "gray" },
          { name: "In Progress", color: "blue" },
          { name: "On Hold", color: "yellow" },
          { name: "Completed", color: "green" },
        ],
        groups: ["To Do", "In Progress", "Complete"],
      },
      Priority: {
        type: "select",
        options: ["Low", "Medium", "High", "Urgent"],
      },
      DueDate: { type: "date" },
      Owner: { type: "people" },
      Team: {
        type: "multi_select",
        options: ["Design", "Development", "Marketing", "Sales", "Support"],
      },
      Description: { type: "rich_text" },
      Budget: { type: "number", format: "dollar" },
    },
  },

  crm: {
    name: "CRM",
    minItems: 15,
    maxItems: 50,
    properties: {
      Name: { type: "title" },
      Company: { type: "rich_text" },
      Status: {
        type: "select",
        options: [
          "Lead",
          "Contacted",
          "Qualified",
          "Proposal",
          "Customer",
          "Churned",
        ],
      },
      Email: { type: "email" },
      Phone: { type: "phone_number" },
      LastContacted: { type: "date" },
      NextFollowUp: { type: "date" },
      Tags: {
        type: "multi_select",
        options: ["VIP", "Enterprise", "SMB", "Startup", "Nonprofit"],
      },
      Notes: { type: "rich_text" },
      AssignedTo: { type: "people" },
      Website: { type: "url" },
      LeadSource: {
        type: "select",
        options: [
          "Website",
          "Referral",
          "Conference",
          "Social Media",
          "Advertising",
        ],
      },
    },
  },

  contentCalendar: {
    name: "Content Calendar",
    minItems: 20,
    maxItems: 60,
    properties: {
      Name: { type: "title" },
      Status: {
        type: "status",
        options: [
          { name: "Planning", color: "gray" },
          { name: "Writing", color: "blue" },
          { name: "Editing", color: "yellow" },
          { name: "Scheduled", color: "orange" },
          { name: "Published", color: "green" },
        ],
      },
      PublishDate: { type: "date" },
      Author: { type: "people" },
      ContentType: {
        type: "select",
        options: [
          "Blog Post",
          "Social Media",
          "Email",
          "Video",
          "Podcast",
          "Whitepaper",
        ],
      },
      Topics: {
        type: "multi_select",
        options: [
          "Product",
          "Industry",
          "Tutorial",
          "Case Study",
          "News",
          "Opinion",
        ],
      },
      Keywords: { type: "rich_text" },
      TargetAudience: {
        type: "multi_select",
        options: [
          "Developers",
          "Managers",
          "Enterprise",
          "Startups",
          "Students",
        ],
      },
      Notes: { type: "rich_text" },
    },
  },

  teamDirectory: {
    name: "Team Directory",
    minItems: 5,
    maxItems: 25,
    properties: {
      Name: { type: "title" },
      Role: { type: "rich_text" },
      Department: {
        type: "select",
        options: [
          "Engineering",
          "Product",
          "Design",
          "Marketing",
          "Sales",
          "Support",
          "HR",
          "Finance",
        ],
      },
      Email: { type: "email" },
      Phone: { type: "phone_number" },
      Location: { type: "rich_text" },
      StartDate: { type: "date" },
      Manager: { type: "people" },
      Skills: {
        type: "multi_select",
        options: [
          "JavaScript",
          "TypeScript",
          "React",
          "Node.js",
          "Python",
          "Design",
          "Marketing",
          "Sales",
        ],
      },
      Projects: { type: "relation" },
    },
  },

  knowledgeBase: {
    name: "Knowledge Base",
    minItems: 10,
    maxItems: 40,
    properties: {
      Name: { type: "title" },
      Category: {
        type: "select",
        options: [
          "Getting Started",
          "How To",
          "Troubleshooting",
          "API",
          "Best Practices",
          "FAQ",
        ],
      },
      Tags: {
        type: "multi_select",
        options: [
          "Internal",
          "Customer Facing",
          "Technical",
          "Product",
          "Process",
        ],
      },
      Author: { type: "people" },
      CreatedDate: { type: "date" },
      LastUpdated: { type: "date" },
      Status: {
        type: "status",
        options: [
          { name: "Draft", color: "gray" },
          { name: "Review", color: "yellow" },
          { name: "Published", color: "green" },
          { name: "Outdated", color: "red" },
        ],
      },
      RelatedArticles: { type: "relation" },
    },
  },
};
