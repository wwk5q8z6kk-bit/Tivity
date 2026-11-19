// Shared by the browser review and SQLite import so both produce the same vault record.
const statuses = { todo: 'planned', doing: 'in_progress', done: 'done' };

/**
 * @param {{id:string, title:string, status:'todo'|'doing'|'done', createdAt:number, updatedAt:number}} task
 * @param {string} projectId
 * @param {string} projectName
 * @param {string} namespace
 */
export function deliveryTaskNode(task, projectId, projectName, namespace) {
  if (!Object.hasOwn(statuses, task.status)) throw new Error('Unsupported status on task ' + task.id);
  return {
    kind: /** @type {const} */ ('task'), title: task.title, content: task.title,
    source: 'tivity:task/' + [projectId, task.id].map(encodeURIComponent).join('/'), namespace,
    tags: ['tivity-delivery'],
    metadata: {
      project_id: projectId, project_name: projectName, task_id: task.id,
      task_status: statuses[task.status], task_completed: task.status === 'done',
      source_created_at_ms: task.createdAt, source_updated_at_ms: task.updatedAt
    }
  };
}
