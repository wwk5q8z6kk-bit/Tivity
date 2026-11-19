import { describe, expect, it } from 'vitest';
import { parseIssueCsv } from './issue-csv';

describe('issue export conversion', () => {
	it('reads quoted multiline Linear descriptions and preserves custom statuses', () => {
		const csv =
			'\uFEFFID,Title,Description,Status,Assignee,Labels\r\nL-2,"Review, again","line 1\r\nline 2",Security review,Pat,"ops,review"';
		const [node] = parseIssueCsv(csv, 'team/a', 'eng').nodes;
		expect(node).toMatchObject({
			title: 'Review, again',
			content: 'line 1\r\nline 2',
			source: 'linear:issue/team%2Fa/L-2',
			namespace: 'eng',
			tags: ['ops', 'review'],
			metadata: { task_status: 'inbox', source_status: 'Security review', task_assignee: 'Pat' }
		});
	});
	it('accepts repeated Jira label headers and stable keys', () => {
		const csv = 'Work item key,Summary,Status,Labels,Labels\nX-1,Deliver,Done,ops,backend';
		const [node] = parseIssueCsv(csv, 'acme', 'eng').nodes;
		expect(node).toMatchObject({
			source: 'jira:issue/acme/X-1',
			content: 'Deliver',
			tags: ['ops', 'backend'],
			metadata: { task_completed: true }
		});
	});
	it('rejects duplicate IDs, unrecognized exports and incomplete rows before applying', () => {
		for (const csv of [
			'ID,Title\nA,First\nA,Again',
			'Name,Team\nFirst,A',
			'ID,Title\n,First',
			'ID,Title'
		]) {
			expect(() => parseIssueCsv(csv, 'team', 'eng')).toThrow();
		}
	});
});
