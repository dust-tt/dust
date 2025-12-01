import type { EvalReport, EvalResult, EvalStatistics } from "./types"

/**
 * Generate a self-contained HTML report with interactive visualizations.
 */
export function generateHTMLReport(report: EvalReport): string {
  const { config, results, statistics, summary, metadata } = report

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Evaluation Report - ${new Date(report.startTime).toLocaleDateString()}</title>
  <style>
    ${getStyles()}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🔬 Evaluation Report</h1>
      <p class="subtitle">Generated ${new Date().toLocaleString()}</p>
    </header>

    <section class="summary-cards">
      <div class="card">
        <div class="card-value">${summary.totalPrompts}</div>
        <div class="card-label">Prompts</div>
      </div>
      <div class="card">
        <div class="card-value">${summary.totalRuns}</div>
        <div class="card-label">Total Runs</div>
      </div>
      <div class="card">
        <div class="card-value">${(summary.successRate * 100).toFixed(1)}%</div>
        <div class="card-label">Success Rate</div>
      </div>
      <div class="card">
        <div class="card-value">${summary.averageScore.toFixed(2)}</div>
        <div class="card-label">Avg Score</div>
      </div>
      <div class="card">
        <div class="card-value">${(summary.normalizedAverageScore * 100).toFixed(1)}%</div>
        <div class="card-label">Normalized</div>
      </div>
      <div class="card">
        <div class="card-value">${(summary.averageJudgeAgreement * 100).toFixed(0)}%</div>
        <div class="card-label">Judge Agreement</div>
      </div>
    </section>

    <section class="config-section">
      <h2>Configuration</h2>
      <div class="config-grid">
        <div class="config-item"><span class="config-key">Agents:</span> ${config.agents.join(", ")}</div>
        <div class="config-item"><span class="config-key">Judge:</span> ${config.judgeAgent}</div>
        <div class="config-item"><span class="config-key">Scale:</span> ${metadata.scaleUsed.type} (${metadata.scaleUsed.min}-${metadata.scaleUsed.max})</div>
        <div class="config-item"><span class="config-key">Runs per prompt:</span> ${config.runs}</div>
        <div class="config-item"><span class="config-key">Judge runs:</span> ${metadata.judgeRunsPerEval}</div>
        <div class="config-item"><span class="config-key">Duration:</span> ${formatDuration(report.totalDuration)}</div>
      </div>
    </section>

    <section class="charts-section">
      <h2>Agent Comparison</h2>
      <div class="chart-container">
        ${generateAgentComparisonChart(statistics, metadata.scaleUsed.max)}
      </div>
    </section>

    <section class="stats-section">
      <h2>Agent Statistics</h2>
      <div class="stats-grid">
        ${statistics.map((stat) => generateAgentStatCard(stat, metadata.scaleUsed.max)).join("")}
      </div>
    </section>

    <section class="distribution-section">
      <h2>Score Distribution</h2>
      <div class="distribution-container">
        ${generateScoreDistribution(results, metadata.scaleUsed.max)}
      </div>
    </section>

    <section class="results-section">
      <h2>Detailed Results</h2>
      <div class="filters">
        <input type="text" id="searchInput" placeholder="Search prompts..." onkeyup="filterResults()">
        <select id="agentFilter" onchange="filterResults()">
          <option value="">All Agents</option>
          ${config.agents.map((a) => `<option value="${a}">${a}</option>`).join("")}
        </select>
        <select id="scoreFilter" onchange="filterResults()">
          <option value="">All Scores</option>
          ${Array.from({ length: metadata.scaleUsed.max - metadata.scaleUsed.min + 1 }, (_, i) => metadata.scaleUsed.min + i)
            .map((s) => `<option value="${s}">${s}</option>`)
            .join("")}
        </select>
        <label class="checkbox-label">
          <input type="checkbox" id="errorFilter" onchange="filterResults()"> Show errors only
        </label>
      </div>
      <table class="results-table" id="resultsTable">
        <thead>
          <tr>
            <th onclick="sortTable(0)">Prompt ↕</th>
            <th onclick="sortTable(1)">Agent ↕</th>
            <th onclick="sortTable(2)">Score ↕</th>
            <th onclick="sortTable(3)">Agreement ↕</th>
            <th onclick="sortTable(4)">Duration ↕</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${results.map((r, i) => generateResultRow(r, i, metadata.scaleUsed.max, metadata.workspaceId)).join("")}
        </tbody>
      </table>
    </section>

    ${generateResultModals(results, metadata.workspaceId)}

    <footer>
      <p>Dust Agent Evaluation System • ${metadata.conversationIds.length} conversations</p>
    </footer>
  </div>

  <script>
    ${getScripts()}
  </script>
</body>
</html>`
}

function getStyles(): string {
  return `
    :root {
      --primary: #6366f1;
      --primary-light: #818cf8;
      --success: #10b981;
      --warning: #f59e0b;
      --error: #ef4444;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --text-muted: #64748b;
      --border: #e2e8f0;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }

    header {
      text-align: center;
      margin-bottom: 2rem;
    }

    header h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }

    .subtitle {
      color: var(--text-muted);
    }

    h2 {
      font-size: 1.25rem;
      margin-bottom: 1rem;
      color: var(--text);
    }

    section {
      margin-bottom: 2rem;
    }

    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 1rem;
    }

    .card {
      background: var(--card-bg);
      border-radius: 12px;
      padding: 1.5rem;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .card-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--primary);
    }

    .card-label {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    .config-section {
      background: var(--card-bg);
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .config-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem;
    }

    .config-item {
      font-size: 0.875rem;
    }

    .config-key {
      font-weight: 600;
      color: var(--text-muted);
    }

    .chart-container {
      background: var(--card-bg);
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .bar-chart {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .bar-row {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .bar-label {
      width: 150px;
      font-size: 0.875rem;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bar-container {
      flex: 1;
      height: 32px;
      background: var(--border);
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    }

    .bar {
      height: 100%;
      background: linear-gradient(90deg, var(--primary), var(--primary-light));
      border-radius: 4px;
      transition: width 0.5s ease;
    }

    .bar-value {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 0.875rem;
      font-weight: 600;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1rem;
    }

    .stat-card {
      background: var(--card-bg);
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .stat-card h3 {
      font-size: 1rem;
      margin-bottom: 1rem;
      color: var(--primary);
    }

    .stat-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
    }

    .stat-item {
      font-size: 0.8125rem;
    }

    .stat-label {
      color: var(--text-muted);
    }

    .stat-value {
      font-weight: 600;
    }

    .distribution-container {
      background: var(--card-bg);
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .histogram {
      display: flex;
      align-items: flex-end;
      justify-content: space-around;
      height: 200px;
      padding: 1rem 0;
      border-bottom: 2px solid var(--border);
    }

    .histogram-bar {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex: 1;
      max-width: 80px;
    }

    .histogram-fill {
      width: 60%;
      background: linear-gradient(180deg, var(--primary), var(--primary-light));
      border-radius: 4px 4px 0 0;
      transition: height 0.5s ease;
    }

    .histogram-label {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .histogram-count {
      font-size: 0.75rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .filters {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .filters input[type="text"],
    .filters select {
      padding: 0.5rem 1rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 0.875rem;
      background: var(--card-bg);
    }

    .filters input[type="text"] {
      flex: 1;
      min-width: 200px;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }

    .results-table {
      width: 100%;
      background: var(--card-bg);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-collapse: collapse;
    }

    .results-table th,
    .results-table td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    .results-table th {
      background: var(--bg);
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      user-select: none;
    }

    .results-table th:hover {
      background: var(--border);
    }

    .results-table td {
      font-size: 0.875rem;
    }

    .results-table tr:hover {
      background: var(--bg);
    }

    .prompt-cell {
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .score-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 0.75rem;
    }

    .score-high { background: #dcfce7; color: #166534; }
    .score-mid { background: #fef3c7; color: #92400e; }
    .score-low { background: #fee2e2; color: #991b1b; }
    .score-error { background: #fecaca; color: #991b1b; }

    .agreement-bar {
      width: 60px;
      height: 6px;
      background: var(--border);
      border-radius: 3px;
      overflow: hidden;
    }

    .agreement-fill {
      height: 100%;
      background: var(--success);
      border-radius: 3px;
    }

    .btn {
      padding: 0.375rem 0.75rem;
      border: none;
      border-radius: 6px;
      font-size: 0.75rem;
      cursor: pointer;
      background: var(--primary);
      color: white;
    }

    .btn:hover {
      background: var(--primary-light);
    }

    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }

    .modal.active {
      display: flex;
    }

    .modal-content {
      background: var(--card-bg);
      border-radius: 12px;
      max-width: 800px;
      max-height: 90vh;
      width: 90%;
      overflow: auto;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
    }

    .modal-header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      background: var(--card-bg);
    }

    .modal-header h3 {
      font-size: 1rem;
    }

    .modal-close {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: var(--text-muted);
    }

    .modal-body {
      padding: 1.5rem;
    }

    .detail-section {
      margin-bottom: 1.5rem;
    }

    .detail-section h4 {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
    }

    .detail-content {
      background: var(--bg);
      padding: 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .votes-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .vote-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
    }

    .meta-item {
      font-size: 0.875rem;
    }

    .meta-label {
      color: var(--text-muted);
      display: block;
    }

    footer {
      text-align: center;
      padding: 2rem;
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    @media (max-width: 768px) {
      .container {
        padding: 1rem;
      }

      .filters {
        flex-direction: column;
      }

      .filters input[type="text"] {
        width: 100%;
      }

      .results-table {
        display: block;
        overflow-x: auto;
      }
    }
  `
}

function getScripts(): string {
  return `
    function filterResults() {
      const search = document.getElementById('searchInput').value.toLowerCase();
      const agent = document.getElementById('agentFilter').value;
      const score = document.getElementById('scoreFilter').value;
      const errorsOnly = document.getElementById('errorFilter').checked;

      const rows = document.querySelectorAll('#resultsTable tbody tr');

      rows.forEach(row => {
        const prompt = row.getAttribute('data-prompt').toLowerCase();
        const rowAgent = row.getAttribute('data-agent');
        const rowScore = row.getAttribute('data-score');
        const hasError = row.getAttribute('data-error') === 'true';

        const matchSearch = prompt.includes(search);
        const matchAgent = !agent || rowAgent === agent;
        const matchScore = !score || rowScore === score;
        const matchError = !errorsOnly || hasError;

        row.style.display = matchSearch && matchAgent && matchScore && matchError ? '' : 'none';
      });
    }

    let sortDirection = {};

    function sortTable(columnIndex) {
      const table = document.getElementById('resultsTable');
      const tbody = table.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));

      sortDirection[columnIndex] = !sortDirection[columnIndex];
      const dir = sortDirection[columnIndex] ? 1 : -1;

      rows.sort((a, b) => {
        let aVal = a.children[columnIndex].getAttribute('data-sort') || a.children[columnIndex].textContent;
        let bVal = b.children[columnIndex].getAttribute('data-sort') || b.children[columnIndex].textContent;

        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);

        if (!isNaN(aNum) && !isNaN(bNum)) {
          return (aNum - bNum) * dir;
        }

        return aVal.localeCompare(bVal) * dir;
      });

      rows.forEach(row => tbody.appendChild(row));
    }

    function openModal(id) {
      document.getElementById('modal-' + id).classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeModal(id) {
      document.getElementById('modal-' + id).classList.remove('active');
      document.body.style.overflow = '';
    }

    // Close modal on outside click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    });

    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
          modal.classList.remove('active');
        });
        document.body.style.overflow = '';
      }
    });
  `
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

function generateAgentComparisonChart(
  statistics: EvalStatistics[],
  maxScore: number
): string {
  if (statistics.length === 0) return "<p>No data available</p>"

  const bars = statistics
    .map((stat) => {
      const percentage = (stat.normalizedScore * 100).toFixed(1)
      return `
      <div class="bar-row">
        <div class="bar-label" title="${stat.agentId}">${stat.agentId}</div>
        <div class="bar-container">
          <div class="bar" style="width: ${percentage}%"></div>
          <div class="bar-value">${stat.averageScore.toFixed(2)}/${maxScore}</div>
        </div>
      </div>
    `
    })
    .join("")

  return `<div class="bar-chart">${bars}</div>`
}

function generateAgentStatCard(stat: EvalStatistics, maxScore: number): string {
  return `
    <div class="stat-card">
      <h3>${stat.agentId}</h3>
      <div class="stat-grid">
        <div class="stat-item">
          <span class="stat-label">Avg Score:</span>
          <span class="stat-value">${stat.averageScore.toFixed(2)}/${maxScore}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Normalized:</span>
          <span class="stat-value">${(stat.normalizedScore * 100).toFixed(1)}%</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Min/Max:</span>
          <span class="stat-value">${stat.minScore}/${stat.maxScore}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Std Dev:</span>
          <span class="stat-value">${stat.stdDev.toFixed(2)}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Error Rate:</span>
          <span class="stat-value">${(stat.errorRate * 100).toFixed(1)}%</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Timeout Rate:</span>
          <span class="stat-value">${(stat.timeoutRate * 100).toFixed(1)}%</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Avg Duration:</span>
          <span class="stat-value">${(stat.averageDurationMs / 1000).toFixed(1)}s</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Judge Agreement:</span>
          <span class="stat-value">${(stat.averageJudgeAgreement * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  `
}

function generateScoreDistribution(
  results: EvalResult[],
  maxScore: number
): string {
  const distribution = new Map<number, number>()

  // Initialize all scores to 0
  for (let i = 0; i <= maxScore; i++) {
    distribution.set(i, 0)
  }

  // Count scores
  for (const result of results) {
    if (!result.error) {
      const score = Math.round(result.judgeResult.finalScore)
      distribution.set(score, (distribution.get(score) || 0) + 1)
    }
  }

  const maxCount = Math.max(...distribution.values(), 1)

  const bars = Array.from(distribution.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([score, count]) => {
      const height = (count / maxCount) * 150
      return `
      <div class="histogram-bar">
        <div class="histogram-count">${count}</div>
        <div class="histogram-fill" style="height: ${height}px"></div>
        <div class="histogram-label">${score}</div>
      </div>
    `
    })
    .join("")

  return `<div class="histogram">${bars}</div>`
}

function getScoreClass(score: number, maxScore: number, hasError: boolean): string {
  if (hasError) return "score-error"
  const normalized = score / maxScore
  if (normalized >= 0.7) return "score-high"
  if (normalized >= 0.4) return "score-mid"
  return "score-low"
}

function generateResultRow(
  result: EvalResult,
  index: number,
  maxScore: number,
  _workspaceId: string
): string {
  const hasError = !!result.error
  const scoreClass = getScoreClass(
    result.judgeResult.finalScore,
    maxScore,
    hasError
  )
  const displayScore = hasError ? "Error" : result.judgeResult.finalScore.toString()

  return `
    <tr data-prompt="${escapeHtml(result.prompt)}"
        data-agent="${result.agentId}"
        data-score="${result.judgeResult.finalScore}"
        data-error="${hasError}">
      <td class="prompt-cell" title="${escapeHtml(result.prompt)}" data-sort="${escapeHtml(result.prompt)}">
        ${escapeHtml(result.prompt.substring(0, 60))}${result.prompt.length > 60 ? "..." : ""}
      </td>
      <td>${result.agentId}</td>
      <td data-sort="${hasError ? -1 : result.judgeResult.finalScore}">
        <span class="score-badge ${scoreClass}">${displayScore}</span>
      </td>
      <td data-sort="${result.judgeResult.agreement}">
        <div class="agreement-bar">
          <div class="agreement-fill" style="width: ${result.judgeResult.agreement * 100}%"></div>
        </div>
        ${(result.judgeResult.agreement * 100).toFixed(0)}%
      </td>
      <td data-sort="${result.agentDurationMs}">${(result.agentDurationMs / 1000).toFixed(1)}s</td>
      <td>
        <button class="btn" onclick="openModal(${index})">View</button>
      </td>
    </tr>
  `
}

function generateResultModals(results: EvalResult[], workspaceId: string): string {
  return results
    .map(
      (result, index) => `
    <div class="modal" id="modal-${index}">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Result Details</h3>
          <button class="modal-close" onclick="closeModal(${index})">&times;</button>
        </div>
        <div class="modal-body">
          <div class="detail-section">
            <h4>Prompt</h4>
            <div class="detail-content">${escapeHtml(result.prompt)}</div>
          </div>

          <div class="detail-section">
            <h4>Agent Response (${result.agentId})</h4>
            <div class="detail-content">${escapeHtml(result.response || "(No response)")}</div>
          </div>

          ${
            result.error
              ? `
          <div class="detail-section">
            <h4>Error</h4>
            <div class="detail-content" style="color: var(--error)">${escapeHtml(result.error)}</div>
          </div>
          `
              : ""
          }

          <div class="detail-section">
            <h4>Judge Votes</h4>
            <div class="votes-list">
              ${result.judgeResult.votes
                .map(
                  (vote, i) => `
                <div class="vote-item">
                  <span class="score-badge score-mid">Vote ${i + 1}: ${vote.score}</span>
                  <span style="color: var(--text-muted)">(${(vote.durationMs / 1000).toFixed(1)}s)</span>
                </div>
              `
                )
                .join("")}
            </div>
            <p style="margin-top: 0.5rem; font-size: 0.875rem">
              <strong>Final:</strong> ${result.judgeResult.finalScore} |
              <strong>Agreement:</strong> ${(result.judgeResult.agreement * 100).toFixed(0)}% |
              <strong>Variance:</strong> ${result.judgeResult.variance.toFixed(2)}
            </p>
          </div>

          <div class="detail-section">
            <h4>Judge Criteria</h4>
            <div class="detail-content">${escapeHtml(result.judgePrompt)}</div>
          </div>

          <div class="detail-section">
            <h4>Metadata</h4>
            <div class="meta-grid">
              <div class="meta-item">
                <span class="meta-label">Run #</span>
                ${result.runNumber}
              </div>
              <div class="meta-item">
                <span class="meta-label">Duration</span>
                ${(result.agentDurationMs / 1000).toFixed(2)}s
              </div>
              <div class="meta-item">
                <span class="meta-label">Retries</span>
                ${result.agentRetryCount}
              </div>
              <div class="meta-item">
                <span class="meta-label">Conversation ID</span>
                <a href="https://dust.tt/w/${workspaceId}/assistant/${result.agentConversationId}" target="_blank" style="color: var(--primary)">
                  ${result.agentConversationId || "N/A"}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
    )
    .join("")
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }
  return text.replace(/[&<>"']/g, (char) => map[char] || char)
}
