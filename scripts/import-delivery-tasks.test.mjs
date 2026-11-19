import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { importTasks } from './import-delivery-tasks.mjs';

test('previews one project locally and resumes after a partial HTTP failure', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'tivity-import-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'source.sqlite');
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE projects(id TEXT, name TEXT);
    CREATE TABLE tasks(id TEXT, project_id TEXT, title TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
    INSERT INTO projects VALUES ('a','Alpha'), ('b','Beta');
    INSERT INTO tasks VALUES ('1','a','First','doing',1,2), ('2','a','Second','done',2,3), ('3','b','Other','todo',1,1);
  `);
  db.close();

  const requests = [];
  const saved = new Map();
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    const key = req.headers['idempotency-key'];
    requests.push({ key, payload });
    if (requests.length === 2) { res.writeHead(503).end(); return; }
    if (!saved.has(key)) saved.set(key, 'n' + saved.size);
    res.writeHead(200).end(JSON.stringify({ id: saved.get(key) }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const args = ['--db', file, '--project', 'a', '--namespace', 'design', '--server', 'http://127.0.0.1:' + server.address().port];
  const options = { log: () => {}, token: '' };
  await importTasks(args, options);
  assert.equal(requests.length, 0);
  await assert.rejects(importTasks([...args, '--apply'], options), /503/);
  await importTasks([...args, '--apply'], options);
  assert.equal(saved.size, 2);
  assert.deepEqual(requests[0], requests[2]);
  assert.equal(requests[0].payload.metadata.task_status, 'in_progress');
  assert.equal(requests[3].payload.metadata.task_completed, true);
  assert.deepEqual(requests.map(r => r.payload.source), ['tivity:task/a/1','tivity:task/a/2','tivity:task/a/1','tivity:task/a/2']);
});
