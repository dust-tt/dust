import type {
  UkgReadyEmployee,
  UkgReadyPTORequest,
} from "@app/lib/actions/mcp_internal_actions/servers/ukg_ready/types";

export function renderCurrentEmployee(employee: UkgReadyEmployee): string {
  const name = `${employee.first_name} ${employee.last_name}`;
  const details = [
    `**Your Employee Information:**`,
    ``,
    `- **Name:** ${name}`,
    `- **Employee ID:** ${employee.employee_id}`,
    employee.username ? `- **Username:** ${employee.username}` : "",
    employee.email ? `- **Email:** ${employee.email}` : "",
    employee.job_title ? `- **Title:** ${employee.job_title}` : "",
    employee.department ? `- **Department:** ${employee.department}` : "",
    employee.status ? `- **Status:** ${employee.status}` : "",
    employee.hire_date ? `- **Hire Date:** ${employee.hire_date}` : "",
  ].filter(Boolean);

  return details.join("\n");
}

export function renderPTORequests(requests: UkgReadyPTORequest[]): string {
  if (requests.length === 0) {
    return "No PTO requests found.";
  }

  return requests
    .map((req) => {
      const status = req.pto_details.request_state;
      const approver = req.pto_details.approved_by?.full_name;
      const rejector = req.pto_details.rejected_by?.full_name;

      let statusLine = `Status: ${status}`;
      if (approver) {
        statusLine += ` (approved by ${approver})`;
      }
      if (rejector) {
        statusLine += ` (rejected by ${rejector})`;
      }

      return `- **${req.time_off.name}**: ${req.from_date} to ${req.to_date}
  ${statusLine}
  Duration: ${req.pto_details.requested_time} ${req.pto_details.duration_unit.toLowerCase()}
  Request ID: ${req.pto_details.request_id}`;
    })
    .join("\n\n");
}
