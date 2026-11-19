// Shared by the browser review and SQLite import so both produce the same vault record.
const statuses = { todo: 'planned', doing: 'in_progress', done: 'done' };

/** @param {unknown} status */
export function boardStatusForVault(status) {
  return Object.entries(statuses).find(([, vaultStatus]) => vaultStatus === status)?.[0];
}

export function deliveryTaskSource(/** @type {string} */ projectId, /** @type {string} */ taskId) {
  return 'tivity:task/' + [projectId, taskId].map(encodeURIComponent).join('/');
}

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
    source: deliveryTaskSource(projectId, task.id), namespace,
    tags: ['tivity-delivery'],
    metadata: {
      project_id: projectId, project_name: projectName, task_id: task.id,
      task_status: statuses[task.status], task_completed: task.status === 'done',
      source_created_at_ms: task.createdAt, source_updated_at_ms: task.updatedAt
    }
  };
}
