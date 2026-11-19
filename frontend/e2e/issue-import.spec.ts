import { expect, test } from '@playwright/test';

test('previews a Jira export and resumes importing at the first unaccepted issue', async ({
	page
}) => {
	const seen: string[] = [];
	await page.route('**/api/v1/**', async (route) => {
		const request = route.request();
		if (new URL(request.url()).pathname !== '/api/v1/nodes' || request.method() !== 'POST') {
			await route.fulfill({ json: [] });
			return;
		}
		const node = request.postDataJSON();
		seen.push(node.metadata.source_issue);
		if (seen.length === 2) {
			await route.fulfill({ status: 409, body: 'Retry fixture' });
			return;
		}
		await route.fulfill({
			json: {
				...node,
				id: node.source,
				importance: 0.5,
				temporal: { created_at: '2026-01-01', updated_at: '2026-01-01' }
			}
		});
	});
	await page.goto('/tasks');
	await page.getByText('Import issues from Linear or Jira').click();
	await page.getByLabel('Source workspace or Jira site').fill('acme');
	await page.getByLabel('Vault namespace').fill('engineering');
	await page.getByLabel('Issue CSV').setInputFiles({
		name: 'issues.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(
			'Issue key,Summary,Status\nOPS-1,Deploy staging,Done\nOPS-2,Check results,Open'
		)
	});
	await page.getByRole('button', { name: 'Preview import' }).click();
	await expect(page.getByText(/2 jira issues for engineering/i)).toBeVisible();
	expect(seen).toHaveLength(0);
	await page.getByRole('button', { name: 'Import issues', exact: true }).click();
	await expect(page.getByText('1 of 2 accepted')).toBeVisible();
	await page.getByRole('button', { name: 'Resume import' }).click();
	await expect(page.getByText('Import complete.')).toBeVisible();
	expect(seen).toEqual(['OPS-1', 'OPS-2', 'OPS-2']);
});
