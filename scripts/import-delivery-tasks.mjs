// Node 24+. Reads a consistent snapshot of one standalone delivery project.
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { deliveryTaskNode } from './delivery-task-node.mjs';

export function readProjectTasks(path, projectId, namespace) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('BEGIN');
    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
    if (!project) throw new Error('Project ID was not found.');
    const tasks = db.prepare('SELECT id, title, status, created_at AS createdAt, updated_at AS updatedAt FROM tasks WHERE project_id = ? ORDER BY created_at, id').all(projectId);
    return tasks.map(task => deliveryTaskNode(task, projectId, project.name, namespace));
  } finally {
    db.close();
  }
}

export async function importTasks(args, { log = console.log, token = process.env.MINDVAULT_AUTH_TOKEN } = {}) {
  const { values } = parseArgs({ args, options: {
    db: { type: 'string' }, project: { type: 'string' }, namespace: { type: 'string' },
    server: { type: 'string', default: 'http://127.0.0.1:9470' }, apply: { type: 'boolean' }
  } });
  if (![values.db, values.project, values.namespace].every(v => v?.trim())) {
    throw new Error('Usage: node scripts/import-delivery-tasks.mjs --db FILE --project ID --namespace NAME [--server URL] [--apply]');
  }
  const tasks = readProjectTasks(values.db, values.project, values.namespace);
  log(JSON.stringify({ tasks: tasks.length, project: values.project, namespace: values.namespace, apply: Boolean(values.apply) }));
  if (!values.apply) return;
  const endpoint = new URL('/api/v1/nodes', values.server);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))) {
    throw new Error('Use HTTPS or a loopback HTTP address for the vault.');
  }
  for (const task of tasks) {
    const key = createHash('sha256').update(JSON.stringify([values.namespace, task.source])).digest('hex');
    const response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(task)
    });
    if (!response.ok) throw new Error('Vault returned HTTP ' + response.status + ' for ' + task.source);
    const node = await response.json();
    if (typeof node?.id !== 'string' || !node.id) throw new Error('Vault returned no node ID for ' + task.source);
    log(JSON.stringify({ source: task.source, nodeId: node.id }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  importTasks(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
