import { describe, expect, it } from 'vitest';
import {
  CONNECTORS,
  TIVITY_MCP_TOOLS,
  agentkitTivityToml,
  attachMcpBundle,
  attachable,
  buzzAttachNote,
  connectorConfig,
  tivityMcpConfig,
} from './connectors';

describe('connector catalog', () => {
  it('attaches only permissive neighbors and holds the rest', () => {
    const attach = CONNECTORS.filter((c) => c.stance === 'attach');
    expect(attach.map((c) => c.id)).toEqual(['buzz', 'agentkit', 'mcp-reference', 'sqlite-vec']);
    expect(attach.every(attachable)).toBe(true);
    const held = CONNECTORS.filter((c) => c.stance === 'hold');
    expect(held.every((c) => c.license === 'unspecified' && !attachable(c))).toBe(true);
  });

  it('names the seven MCP tools and a client config that points at this repo', () => {
    expect(TIVITY_MCP_TOOLS).toHaveLength(7);
    const config = JSON.parse(tivityMcpConfig('/src/Tivity')) as {
      mcpServers: { tivity: { command: string; args: string[] } };
    };
    expect(config.mcpServers.tivity.command).toBe('node');
    expect(config.mcpServers.tivity.args[0]).toBe('/src/Tivity/packages/ide-client/dist/tivity-mcp.mjs');
  });

  it('ships a full attach bundle and AgentKit / Buzz snippets', () => {
    const bundle = JSON.parse(attachMcpBundle('/src/Tivity')) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(Object.keys(bundle.mcpServers).sort()).toEqual(['fetch', 'filesystem', 'git', 'tivity']);
    expect(agentkitTivityToml('/src/Tivity')).toContain('tivity_create_task');
    expect(buzzAttachNote('/src/Tivity')).toContain('Buzz (Apache-2.0)');
    expect(connectorConfig(CONNECTORS.find((c) => c.id === 'sqlite-vec')!)).toContain('blendSearchRanks');
    expect(connectorConfig(CONNECTORS.find((c) => c.id === 'github')!)).toBeNull();
  });
});
