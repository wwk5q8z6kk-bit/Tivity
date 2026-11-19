export interface DiscussionExcerpt {
	type: 'tivity.review-comment.v1';
	taskTitle: string;
	projectId: string;
	taskId: string;
	commentId: string;
	author: string;
	body: string;
	createdAt: number;
}

export function isExcerpt(value: unknown): value is DiscussionExcerpt {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	return (
		record.type === 'tivity.review-comment.v1' &&
		['taskTitle', 'projectId', 'taskId', 'commentId', 'author', 'body'].every(
			(key) => typeof record[key] === 'string' && record[key].trim().length > 0
		) &&
		typeof record.createdAt === 'number' &&
		Number.isSafeInteger(record.createdAt)
	);
}

export function excerptRequest(excerpt: DiscussionExcerpt, namespace: string | null) {
	return {
		kind: 'reference',
		title: excerpt.taskTitle,
		content: excerpt.body,
		namespace,
		source:
			'tivity:discussion/' +
			[excerpt.projectId, excerpt.taskId, excerpt.commentId].map(encodeURIComponent).join('/'),
		tags: ['delivery-evidence'],
		metadata: {
			project_id: excerpt.projectId,
			task_id: excerpt.taskId,
			comment_id: excerpt.commentId,
			author_label: excerpt.author,
			source_created_at_ms: excerpt.createdAt
		}
	};
}
