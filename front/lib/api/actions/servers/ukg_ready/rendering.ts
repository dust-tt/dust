import type {
  UkgReadyAccrualBalance,
  UkgReadyEmployee,
  UkgReadyExecuteResult,
  UkgReadyPTORequest,
  UkgReadyPTORequestNote,
  UkgReadySchedule,
} from "@app/lib/api/actions/servers/ukg_ready/types";

export function renderCurrentEmployee(employee: UkgReadyEmployee): string {
  const name = `${employee.first_name} ${employee.last_name}`;
  const details = [
    `**Your Employee Information:**`,
    ``,
    `- **Name:** ${name}`,
    `- **Employee ID:** ${employee.employee_id}`,
    employee.username ? `- **Username:** ${employee.username}` : "",
    employee.email ? `- **Email:** ${employee.email}` : "",
  ].filter(Boolean);

  return details.join("\n");
}

export function renderPTORequests(requests: UkgReadyPTORequest[]): string {
  if (requests.length === 0) {
    return "No PTO requests found.";
  }

  return requests
    .map((req) => {
      const details = [];

      if (req.time_off?.name) {
        details.push(`**${req.time_off.name}**`);
      } else {
        details.push(`**PTO Request**`);
      }

      if (req.pto_details?.request_id) {
        details.push(`Request ID: ${req.pto_details.request_id}`);
      }

      if (req.pto_details?.note_thread_id) {
        details.push(`Note Thread ID: ${req.pto_details.note_thread_id}`);
      }

      if (req.pto_details?.request_state) {
        let statusLine = `Status: ${req.pto_details.request_state}`;
        if (req.pto_details.approved_by?.full_name) {
          statusLine += ` (approved by ${req.pto_details.approved_by.full_name})`;
        }
        if (req.pto_details.rejected_by?.full_name) {
          statusLine += ` (rejected by ${req.pto_details.rejected_by.full_name})`;
        }
        details.push(statusLine);
      }

      if (req.pto_details?.request_type) {
        details.push(`Type: ${req.pto_details.request_type}`);
      }

      if (req.pto_details?.requested_date) {
        details.push(`Date: ${req.pto_details.requested_date}`);
      }

      if (req.pto_details?.requested_time) {
        const durationUnit = req.pto_details.duration_unit?.toLowerCase() ?? "";
        details.push(
          `Duration: ${req.pto_details.requested_time} ${durationUnit}`
        );
      }

      if (req.dynamic_duration_type) {
        details.push(`Duration Type: ${req.dynamic_duration_type}`);
      }

      if (req.employee?.username) {
        details.push(`Employee: ${req.employee.username}`);
      }

      return `- ${details.join("\n  ")}`;
    })
    .join("\n\n");
}

function msToHours(ms: number): number {
  return ms / (1000 * 60 * 60);
}

function formatHours(ms: number): string {
  return msToHours(ms).toFixed(2);
}

export function renderAccrualBalances(
  balances: UkgReadyAccrualBalance[]
): string {
  if (balances.length === 0) {
    return "No accrual balances found.";
  }

  const header =
    "**Available Time Off Types** (use the exact 'Time Off Type Name' value when creating PTO requests):\n\n";

  const balancesText = balances
    .map((balance) => {
      const details = [
        `- **Time Off Type Name:** "${balance.time_off.name}"`,
        `  (Copy the exact text between the quotes when creating PTO requests)`,
        `  ID: ${balance.time_off.id}`,
        `  Accrual Year: ${balance.accrual_year.start_date} to ${balance.accrual_year.end_date}`,
      ];

      if (balance.remaining !== undefined) {
        details.push(`  Remaining: ${formatHours(balance.remaining)} hours`);
      }

      if (balance.accrued !== undefined) {
        details.push(`  Accrued: ${formatHours(balance.accrued)} hours`);
      }

      if (balance.accrued_to) {
        details.push(`  Accrued To: ${balance.accrued_to}`);
      }

      if (balance.taken !== undefined && balance.taken > 0) {
        details.push(`  Taken: ${formatHours(balance.taken)} hours`);
      }

      if (balance.scheduled !== undefined && balance.scheduled > 0) {
        details.push(`  Scheduled: ${formatHours(balance.scheduled)} hours`);
      }

      if (
        balance.pending_approval !== undefined &&
        balance.pending_approval > 0
      ) {
        details.push(
          `  Pending Approval: ${formatHours(balance.pending_approval)} hours`
        );
      }

      if (balance.carry_over !== undefined && balance.carry_over > 0) {
        details.push(`  Carry Over: ${formatHours(balance.carry_over)} hours`);
      }

      if (
        balance.estimated_remaining !== undefined &&
        balance.estimated_remaining > 0
      ) {
        details.push(
          `  Estimated Remaining: ${formatHours(balance.estimated_remaining)} hours`
        );
      }

      return details.join("\n");
    })
    .join("\n\n");

  return header + balancesText;
}

export function renderPTORequestNotes(notes: UkgReadyPTORequestNote[]): string {
  if (notes.length === 0) {
    return "No notes found for this PTO request.";
  }

  return notes
    .map(
      (note) =>
        `- **${note.created_by.display_name}** (${note.created_at}):\n  ${note.text}`
    )
    .join("\n\n");
}

export function renderSchedules(schedules: UkgReadySchedule[]): string {
  if (schedules.length === 0) {
    return "No schedules found.";
  }

  return schedules
    .map((schedule) => {
      const details = [`- **Date:** ${schedule.date}`];

      if (schedule.type_name) {
        details.push(`  Type: ${schedule.type_name}`);
      }

      if (schedule.start_time && schedule.end_time) {
        details.push(`  Time: ${schedule.start_time} - ${schedule.end_time}`);
      } else if (schedule.start_time) {
        details.push(`  Start Time: ${schedule.start_time}`);
      }

      if (schedule.total_hours) {
        details.push(`  Total Hours: ${schedule.total_hours}`);
      }

      if (schedule.job?.name) {
        details.push(`  Job: ${schedule.job.name}`);
      }

      if (schedule.cost_center_1?.name) {
        details.push(`  Cost Center: ${schedule.cost_center_1.name}`);
      }

      if (schedule.employee) {
        const empDetails = [];
        if (schedule.employee.username) {
          empDetails.push(`Username: ${schedule.employee.username}`);
        }
        if (schedule.employee.employee_id) {
          empDetails.push(`ID: ${schedule.employee.employee_id}`);
        }
        if (empDetails.length > 0) {
          details.push(`  Employee: ${empDetails.join(", ")}`);
        }
      }

      if (schedule.is_working !== undefined) {
        details.push(`  Working Day: ${schedule.is_working ? "Yes" : "No"}`);
      }

      if (schedule.predicted !== undefined && schedule.predicted) {
        details.push(`  Status: Predicted`);
      }

      return details.join("\n");
    })
    .join("\n\n");
}

export function renderEmployees(employees: UkgReadyEmployee[]): string {
  if (employees.length === 0) {
    return "No employees found.";
  }

  return employees
    .map((emp) => {
      const details = [
        `**Employee:**`,
        `- ID: ${emp.id}`,
        `- First Name: ${emp.first_name}`,
        `- Last Name: ${emp.last_name}`,
        `- Username: ${emp.username ?? "N/A"}`,
        `- Employee ID: ${emp.employee_id}`,
      ];

      return details.join("\n");
    })
    .join("\n\n");
}

export function renderPTORequestResult(result: UkgReadyExecuteResult): string {
  let responseText = "PTO request submitted.\n\n";
  if (result.success_code !== undefined) {
    responseText += `Success code: ${result.success_code}\n`;
  }
  if (result.messages && result.messages.length > 0) {
    responseText += "\nMessages:\n";
    result.messages.forEach((msg) => {
      responseText += `- [${msg.type.toUpperCase()}]`;
      if (msg.code !== undefined) {
        responseText += ` (code: ${msg.code})`;
      }
      if (msg.message) {
        responseText += `: ${msg.message}`;
      }
      responseText += "\n";
    });
  }
  return responseText;
}
