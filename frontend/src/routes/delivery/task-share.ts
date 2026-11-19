export interface TaskShare {
	type: 'tivity.share-task.v1';
	projectName: string;
	task: {
		id: string;
		projectId: string;
		title: string;
		status: 'todo' | 'doing' | 'done';
		createdAt: number;
		updatedAt: number;
	};
}

export function isTaskShare(value: unknown): value is TaskShare {
	if (
		!value ||
		typeof value !== 'object' ||
		!('type' in value) ||
		value.type !== 'tivity.share-task.v1' ||
		!('projectName' in value) ||
		typeof value.projectName !== 'string' ||
		!('task' in value) ||
		!value.task ||
		typeof value.task !== 'object'
	)
		return false;
	const task = value.task as Record<string, unknown>;
	return (
		['id', 'projectId', 'title'].every(
			(key) => typeof task[key] === 'string' && task[key].trim()
		) &&
		(task.status === 'todo' || task.status === 'doing' || task.status === 'done') &&
		Number.isSafeInteger(task.createdAt) &&
		Number.isSafeInteger(task.updatedAt)
	);
}
