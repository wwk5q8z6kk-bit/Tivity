import { expect, test } from '@playwright/test';

test('promotes only a reviewed discussion excerpt and preserves its source on retry', async ({
	page
}) => {
	const writes: Array<{ key: string; payload: Record<string, unknown> }> = [];
	await page.route('**/api/v1/**', async (route) => {
		const request = route.request();
		if (new URL(request.url()).pathname === '/api/v1/nodes' && request.method() === 'POST') {
			if (request.headers().authorization !== 'Bearer workspace-test-token') {
				await route.fulfill({ status: 401, contentType: 'text/plain', body: 'Unauthorized' });
				return;
			}
			writes.push({ key: request.headers()['idempotency-key'], payload: request.postDataJSON() });
			await route.fulfill({ json: { id: 'reference-1' } });
		} else {
			await route.fulfill({ json: [] });
		}
	});

	await page.goto('/delivery');
	const frame = page.frameLocator('iframe[title="Tivity delivery workspace"]');
	const title = 'Connect your first docs and tasks with links';
	await frame.getByRole('button', { name: title, exact: true }).click();
	const discussion = frame.getByRole('region', { name: 'Task discussion' });
	await discussion.getByLabel('Comment', { exact: true }).fill('Acceptance criteria verified.');
	await discussion.getByRole('button', { name: 'Post comment' }).click();
	const review = discussion.getByRole('button', { name: 'Review for vault' });
	await review.click();
	await expect(page.getByRole('blockquote')).toHaveText('Acceptance criteria verified.');
	await page.getByRole('button', { name: 'Cancel' }).click();
	expect(writes).toHaveLength(0);
	for (let i = 0; i < 2; i++) {
		await review.click();
		await page.getByRole('button', { name: 'Save reference' }).click();
		if (i === 0) {
			await page.getByLabel('Vault access token').fill('workspace-test-token');
			await page.getByRole('button', { name: 'Save reference' }).click();
		}
		await expect(page.getByText('Reference saved to the vault.')).toBeVisible();
	}
	expect(writes).toHaveLength(2);
	expect(writes[1]).toEqual(writes[0]);
	expect(writes[0].key).toMatch(/^[a-f0-9]{64}$/);
	expect(writes[0].payload).toMatchObject({
		kind: 'reference',
		title,
		content: 'Acceptance criteria verified.',
		source: expect.stringMatching(/^tivity:discussion\//),
		metadata: { author_label: 'You' }
	});
});
