// Connector catalog. Tivity stays the record. Other runtimes attach over
// MCP. Nothing in this list is vendored into the desktop bundle.

export type ConnectorLicense = 'Apache-2.0' | 'MIT' | 'MIT+Apache-2.0' | 'this-app' | 'unspecified';

export type ConnectorStance = 'built-in' | 'attach' | 'hold';

export type ConnectorConfigKind = 'mcp-json' | 'agentkit-toml' | 'plain';

export interface Connector {
  id: string;
  name: string;
  stance: ConnectorStance;
  license: ConnectorLicense;
  summary: string;
  where: string;
  how: string;
  /** Copyable attach snippet when one exists. */
  configKind?: ConnectorConfigKind;
}

const PERMISSIVE: ReadonlySet<ConnectorLicense> = new Set(['Apache-2.0', 'MIT', 'MIT+Apache-2.0']);

export function attachable(connector: Connector): boolean {
  return connector.stance === 'attach' && PERMISSIVE.has(connector.license);
}

export const TIVITY_MCP_TOOLS = [
  'tivity_projects',
  'tivity_search',
  'tivity_tasks',
  'tivity_create_task',
  'tivity_set_task_status',
  'tivity_record_memory',
  'tivity_impact',
] as const;

export function tivityMcpServer(repoRoot = '<tivity>'): { command: string; args: string[] } {
  return {
    command: 'node',
    args: [`${repoRoot}/packages/ide-client/dist/tivity-mcp.mjs`],
  };
}

export function tivityMcpConfig(repoRoot = '<tivity>'): string {
  return JSON.stringify({
    mcpServers: {
      tivity: tivityMcpServer(repoRoot),
    },
  }, null, 2);
}

/** Official reference servers that sit beside Tivity in a client config. */
export function referenceMcpServers(): Record<string, { command: string; args: string[] }> {
  return {
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '<workspace>'],
    },
    git: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-git', '--repository', '<workspace>'],
    },
    fetch: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
    },
  };
}

/** Cursor / Copilot style config: Tivity plus the reference servers. */
export function attachMcpBundle(repoRoot = '<tivity>'): string {
  return JSON.stringify({
    mcpServers: {
      tivity: tivityMcpServer(repoRoot),
      ...referenceMcpServers(),
    },
  }, null, 2);
}

/** AgentKit agent fragment that mounts Tivity tools over stdio. */
export function agentkitTivityToml(repoRoot = '<tivity>'): string {
  const toolList = TIVITY_MCP_TOOLS.map((t) => `"${t}"`).join(', ');
  return [
    'mcp_servers = [',
    '  {',
    `    command = ["node", "${repoRoot}/packages/ide-client/dist/tivity-mcp.mjs"],`,
    '    prefix = "tivity_",',
    `    available_tools = [${toolList}],`,
    '    timeout_s = 30',
    '  },',
    ']',
    '',
    '# List the tools your AgentKit build exposes from this server in the agent tools array.',
  ].join('\n');
}

/** Buzz stays its own process. Agents there call the same Tivity MCP server. */
export function buzzAttachNote(repoRoot = '<tivity>'): string {
  return [
    '# Buzz (Apache-2.0) runs beside Tivity. Do not import the Rust relay.',
    '# Point any Buzz agent / sprig MCP host at the same stdio server:',
    tivityMcpConfig(repoRoot),
    '',
    '# Buzz checkout (neighbor): /Users/x/Projects/GitHub/buzz',
  ].join('\n');
}

export function connectorConfig(connector: Connector, repoRoot = '<tivity>'): string | null {
  switch (connector.id) {
    case 'tivity-mcp':
      return tivityMcpConfig(repoRoot);
    case 'mcp-bundle':
      return attachMcpBundle(repoRoot);
    case 'mcp-reference':
      return JSON.stringify({ mcpServers: referenceMcpServers() }, null, 2);
    case 'agentkit':
      return agentkitTivityToml(repoRoot);
    case 'buzz':
      return buzzAttachNote(repoRoot);
    case 'sqlite-vec':
      return [
        '# sqlite-vec is MIT OR Apache-2.0. It is not an MCP server.',
        '# Lexical search stays FTS5. Vector candidates blend with reciprocal rank fusion',
        '# via blendSearchRanks() in @tivity/core. Load the native extension in the',
        '# Node and Tauri SQLite openers when the platform spike lands.',
        'https://github.com/asg017/sqlite-vec',
      ].join('\n');
    default:
      return null;
  }
}

export const CONNECTORS: readonly Connector[] = [
  {
    id: 'tivity-mcp',
    name: 'Tivity MCP',
    stance: 'built-in',
    license: 'this-app',
    summary: 'This app is the server. Cursor, Copilot, and Claude Code call seven tools over stdio and write the same database.',
    where: 'packages/ide-client',
    how: 'Register tivity-mcp in the agent client. The desktop app does not need to embed those agents.',
    configKind: 'mcp-json',
  },
  {
    id: 'mcp-bundle',
    name: 'Full MCP attach bundle',
    stance: 'built-in',
    license: 'this-app',
    summary: 'One client config: Tivity plus filesystem, git, and fetch reference servers.',
    where: 'packages/core/src/connectors.ts',
    how: 'Paste into Cursor or any MCP host. Replace <tivity> and <workspace> with real paths.',
    configKind: 'mcp-json',
  },
  {
    id: 'github',
    name: 'GitHub issues',
    stance: 'built-in',
    license: 'this-app',
    summary: 'Pull and push issues as tasks. The token stays in memory.',
    where: 'packages/github-sync',
    how: 'Open Sync, use a fine-grained PAT, pull first. App webhooks are still a later path.',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    stance: 'built-in',
    license: 'this-app',
    summary: 'Local model for the agent-task job. Notes land in memory. The agent does not edit records on its own.',
    where: 'packages/agent-runtime',
    how: 'Ask from Agents. Override the endpoint with TIVITY_MODEL_* when you want a different OpenAI-compatible host.',
  },
  {
    id: 'vscode',
    name: 'VS Code',
    stance: 'built-in',
    license: 'this-app',
    summary: 'Human commands over the same database: search, tasks, memory, impact.',
    where: 'apps/vscode-tivity',
    how: 'Run the extension from source. Agents can skip it and use the MCP server directly.',
  },
  {
    id: 'buzz',
    name: 'Buzz',
    stance: 'attach',
    license: 'Apache-2.0',
    summary: 'A workspace where people and agents share rooms on a relay you own. It is a neighbor, not a dependency.',
    where: '/Users/x/Projects/GitHub/buzz',
    how: 'Keep Buzz running beside Tivity. Its agents call tivity-mcp when they need the project record. Do not import the Rust relay into this bundle.',
    configKind: 'plain',
  },
  {
    id: 'agentkit',
    name: 'AgentKit',
    stance: 'attach',
    license: 'MIT',
    summary: 'Python workers with tools, evals, and an MCP client. A place for bots that should not live inside the desktop UI.',
    where: '/Users/x/Projects/GitHub/agentkit',
    how: 'Point an AgentKit worker at the Tivity MCP server. The worker runs outside the app and writes tasks and memory through the tools.',
    configKind: 'agentkit-toml',
  },
  {
    id: 'mcp-reference',
    name: 'MCP reference servers',
    stance: 'attach',
    license: 'MIT+Apache-2.0',
    summary: 'Filesystem, git, and fetch servers maintained with the protocol. New code is Apache-2.0. Older files remain MIT.',
    where: 'https://github.com/modelcontextprotocol/servers',
    how: 'Add the server you need next to tivity in the same MCP client config. They are reference servers, so treat them as examples you run on purpose.',
    configKind: 'mcp-json',
  },
  {
    id: 'sqlite-vec',
    name: 'sqlite-vec',
    stance: 'attach',
    license: 'MIT+Apache-2.0',
    summary: 'Local vector search inside SQLite. FTS5 stays the lexical path; vector candidates blend by reciprocal rank.',
    where: 'https://github.com/asg017/sqlite-vec',
    how: 'Use blendSearchRanks in @tivity/core today. Load the native extension in Node and Tauri openers when that platform spike lands. Do not vendor a hosted memory service.',
    configKind: 'plain',
  },
  {
    id: 'agent-os',
    name: 'agent-os MCP',
    stance: 'hold',
    license: 'unspecified',
    summary: 'Workflow tools (plan, brainstorm, handoff) already exist as an MCP server on this machine.',
    where: '/Users/x/Projects/GitHub/agent-os',
    how: 'No LICENSE file in that checkout. It stays off the attach list until the license is stated.',
  },
  {
    id: 'hydra',
    name: 'Hydra Brain',
    stance: 'hold',
    license: 'unspecified',
    summary: 'Local thinking loop: plan, check, remember with evidence. Useful as a worker later.',
    where: '/Users/x/Projects/GitHub/hydra-brain',
    how: 'No LICENSE file in that checkout. Connect it later as a client of tivity-mcp, not by copying the brain into this repo.',
  },
  {
    id: 'awr',
    name: 'Autonomous Workflow Runtime',
    stance: 'hold',
    license: 'unspecified',
    summary: 'The lease, checkpoint, and replay pattern is already in the job ledger. The runtime itself expects Postgres.',
    where: '/Users/x/Projects/GitHub/autonomous-workflow-runtime',
    how: 'No LICENSE file, and the database does not fit the desktop app. Keep the pattern. Do not vendor the service.',
  },
];
