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
	await review.click();
	await page.getByLabel('Save as').selectOption('task');
	await page.getByLabel('Follow-up title').fill('Ship the accepted change');
	await page.getByRole('button', { name: 'Create follow-up task' }).click();
	await expect(page.getByText('Follow-up task created in the vault inbox.')).toBeVisible();
	expect(writes).toHaveLength(3);
	expect(writes[2].key).not.toBe(writes[0].key);
	expect(writes[2].payload).toMatchObject({
		kind: 'task',
		title: 'Ship the accepted change',
		metadata: { task_status: 'inbox' }
	});
	expect(writes[1]).toEqual(writes[0]);
	expect(writes[0].key).toMatch(/^[a-f0-9]{64}$/);
	expect(writes[0].payload).toMatchObject({
		kind: 'observation',
		title,
		content: 'Acceptance criteria verified.',
		source: expect.stringMatching(/^tivity:discussion\//),
		metadata: { author_label: 'You' }
	});
});

test('uses scoped credentials for shared tasks and clears the thread on disconnect', async ({
	page
}) => {
	let body = '';
	await page.route('**/api/v1/**', async (route) => {
		const req = route.request();
		const url = new URL(req.url());
		if (
			url.searchParams.get('namespace') === 'delivery-qa' ||
			url.pathname.endsWith('/shared/comments')
		) {
			if (req.headers().authorization !== 'Bearer scoped-test') {
				await route.fulfill({ status: 401 });
				return;
			}
			if (url.pathname.endsWith('/comments')) {
				if (req.method() === 'POST') body = req.postDataJSON().body;
				const row = {
					id: 'comment',
					node_id: 'shared',
					body,
					created_at: new Date().toISOString()
				};
				await route.fulfill({ json: req.method() === 'POST' ? row : body ? [row] : [] });
			} else {
				expect(url.searchParams.get('kind')).toBe('task');
				await route.fulfill({ json: [{ id: 'shared', title: 'Review launch' }] });
			}
			return;
		}
		await route.fulfill({ json: [] });
	});

	await page.goto('/delivery');
	await page.getByRole('button', { name: 'Shared task discussions' }).click();
	const panel = page.getByRole('region', { name: 'Shared task discussions' });
	await panel.getByLabel('Vault namespace').fill('delivery-qa');
	await panel.getByRole('button', { name: 'Load tasks' }).click();
	await expect(panel.getByRole('alert')).toContainText('valid vault access token');
	await panel.getByLabel('Vault access token').fill('scoped-test');
	await panel.getByRole('button', { name: 'Load tasks' }).click();
	await panel.getByLabel('New comment').fill('Launch approved');
	await panel.getByRole('button', { name: 'Add comment' }).click();
	await expect(panel.getByText('Launch approved', { exact: true })).toBeVisible();
	await panel.getByRole('button', { name: 'Disconnect' }).click();
	await expect(panel.getByLabel('Vault access token')).toHaveValue('');
	await expect(panel.getByText('Launch approved', { exact: true })).toHaveCount(0);
});

test('shares a selected board task only after review and reuses its import identity', async ({
	page
}) => {
	const writes: { key: string; payload: Record<string, unknown> }[] = [];
	await page.route('**/api/v1/**', async (route) => {
		if (
			new URL(route.request().url()).pathname === '/api/v1/nodes' &&
			route.request().method() === 'POST'
		) {
			writes.push({
				key: route.request().headers()['idempotency-key'],
				payload: route.request().postDataJSON()
			});
			await route.fulfill({ json: { id: 'shared-task' } });
		} else await route.fulfill({ json: [] });
	});
	await page.goto('/delivery');
	const frame = page.frameLocator('iframe[title="Tivity delivery workspace"]');
	const title = 'Connect your first docs and tasks with links';
	await frame.getByRole('button', { name: title, exact: true }).click();
	const launch = frame.getByRole('button', { name: 'Share task with vault' });
	const review = page.getByRole('form', { name: 'Review task for sharing' });
	await launch.click();
	await review.getByRole('button', { name: 'Cancel' }).click();
	expect(writes).toHaveLength(0);
	for (let i = 0; i < 2; i++) {
		await launch.click();
		await review.getByLabel('Vault namespace').fill('team');
		await review.getByRole('button', { name: 'Share task', exact: true }).click();
		await expect(page.getByText('Task shared with team.')).toBeVisible();
	}
	expect(writes).toHaveLength(2);
	expect(writes[1]).toEqual(writes[0]);
	expect(writes[0].payload).toMatchObject({
		kind: 'task',
		title,
		namespace: 'team',
		source: expect.stringMatching(/^tivity:task\//),
		metadata: { task_status: expect.any(String), source_created_at_ms: expect.any(Number) }
	});
	const { createHash } = await import('node:crypto');
	expect(writes[0].key).toBe(
		createHash('sha256')
			.update(JSON.stringify(['team', writes[0].payload.source]))
			.digest('hex')
	);
});

test('reviews a changed vault status and rejects a stale board revision', async ({ page }) => {
	let node: Record<string, any> | null = null;
	await page.route('**/api/v1/**', async (route) => {
		const req = route.request();
		const path = new URL(req.url()).pathname;
		if (path === '/api/v1/nodes' && req.method() === 'POST') {
			node = { ...req.postDataJSON(), id: 'shared' };
			await route.fulfill({ json: node });
		} else if (path === '/api/v1/nodes/shared') {
			expect(req.headers().authorization).toBe('Bearer writer');
			await route.fulfill({
				json: { ...node, metadata: { ...node?.metadata, task_status: 'done' } }
			});
		} else await route.fulfill({ json: path === '/api/v1/nodes' && node ? [node] : [] });
	});
	await page.goto('/delivery');
	const frame = page.frameLocator('iframe[title="Tivity delivery workspace"]');
	const title = 'Connect your first docs and tasks with links';
	await frame.getByRole('button', { name: title, exact: true }).click();
	await frame.getByRole('button', { name: 'Share task with vault' }).click();
	await page
		.getByRole('form', { name: 'Review task for sharing' })
		.getByRole('button', { name: 'Share task', exact: true })
		.click();
	await page.getByRole('button', { name: 'Shared task discussions' }).click();
	const panel = page.getByRole('region', { name: 'Shared task discussions' });
	await panel.getByLabel('Vault access token').fill('writer');
	await panel.getByRole('button', { name: 'Load tasks' }).click();
	const compare = panel.getByRole('button', { name: 'Review status on board' });
	await compare.click();
	const review = frame.getByRole('region', { name: 'Vault status review' });
	await expect(review.getByRole('heading')).toHaveText(title);
	const inspector = frame.getByRole('complementary', { name: 'Selected task' });
	// Change the local task while the review remains open.
	await inspector.locator('button.ghost').first().click();
	await expect(inspector.locator('p .pill')).toHaveClass(/doing/);
	await review.getByRole('button', { name: 'Apply vault status' }).click();
	await expect(review.getByRole('status')).toContainText('board changed');
	await compare.click();
	await review.getByRole('button', { name: 'Apply vault status' }).click();
	await expect(review.getByRole('status')).toHaveText('Board status updated.');
	await compare.click();
	await expect(review.getByRole('status')).toContainText('same status');
});
