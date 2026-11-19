import { parse } from 'csv-parse/browser/esm/sync';
import type { StoreNodeRequest } from '$lib/api/types';
import type { TaskStatus } from '$lib/api/tasks';

const statuses = new Map<string, TaskStatus>([
	['todo', 'planned'],
	['to do', 'planned'],
	['open', 'planned'],
	['planned', 'planned'],
	['in progress', 'in_progress'],
	['in review', 'review'],
	['review', 'review'],
	['blocked', 'waiting'],
	['done', 'done'],
	['closed', 'done'],
	['completed', 'done']
]);

export function parseIssueCsv(csv: string, workspace: string, namespace: string) {
	if (!workspace.trim() || !namespace.trim())
		throw new Error('Enter a source workspace and destination namespace.');
	const [header, ...rows]: string[][] = parse(csv, { bom: true, skip_empty_lines: true });
	if (!header?.length) throw new Error('The file is empty.');
	const names = header.map((name) => name.trim().toLowerCase());
	const jiraId = ['issue key', 'work item key', 'key'].find((key) => names.includes(key));
	const jira = Boolean(jiraId && names.includes('summary'));
	const linear = names.includes('id') && names.includes('title');
	if (jira === linear)
		throw new Error('Expected Jira key and Summary columns, or Linear ID and Title columns.');
	if (!rows.length) throw new Error('The CSV contains no issues.');
	const provider = jira ? 'jira' : 'linear';
	const ids = new Set<string>();
	const nodes: StoreNodeRequest[] = rows.map((row, index) => {
		const field = (name: string) => row[names.indexOf(name)] ?? '';
		const id = field(jira ? jiraId! : 'id').trim();
		const title = field(jira ? 'summary' : 'title').trim();
		if (!id || !title) throw new Error('Missing issue key or title in record ' + (index + 1));
		if (ids.has(id)) throw new Error('Duplicate issue key: ' + id);
		ids.add(id);
		const status = field('status').trim();
		const mapped = statuses.get(status.toLowerCase()) ?? 'inbox';
		const labelValues = row.filter((_, i) => names[i] === 'labels');
		const labels = (jira ? labelValues : labelValues.flatMap((label) => label.split(',')))
			.map((s) => s.trim())
			.filter(Boolean);
		return {
			kind: 'task',
			title,
			content: field('description') || title,
			namespace: namespace.trim(),
			source: provider + ':issue/' + [workspace.trim(), id].map(encodeURIComponent).join('/'),
			tags: [...new Set(labels)],
			metadata: {
				source_provider: provider,
				source_workspace: workspace.trim(),
				source_issue: id,
				source_status: status,
				source_priority: field('priority'),
				source_project: field('project') || field('project key'),
				source_created: field('created'),
				source_updated: field('updated'),
				task_assignee: field('assignee'),
				task_status: mapped,
				task_completed: mapped === 'done'
			}
		};
	});
	return { provider, nodes };
}
