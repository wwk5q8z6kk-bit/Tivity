import { expect, test } from '@playwright/test';

test('reopens only the chosen canvas cards with current vault content and saved geometry', async ({
	page
}) => {
	const first = '11111111-1111-4111-8111-111111111111';
	const second = '22222222-2222-4222-8222-222222222222';
	const view = '33333333-3333-4333-8333-333333333333';
	const task = (id: string, title: string) => ({
		id,
		title,
		namespace: 'team',
		kind: 'task',
		content: 'Original text',
		metadata: {},
		tags: []
	});
	const a = task(first, 'Launch plan'),
		b = task(second, 'Other work');
	let saved: Record<string, unknown> | undefined;
	let hide = false;
	const questions: { path: string; body: { message: string; history: unknown[] } }[] = [];
	await page.route('**/api/v1/**', async (route) => {
		const req = route.request(),
			url = new URL(req.url());
		if (url.pathname.endsWith('/chat') && req.method() === 'POST') {
			questions.push({ path: url.pathname, body: req.postDataJSON() });
			return route.fulfill({ json: { answer: 'Check the launch plan.', sources: [] } });
		}
		if (url.pathname === '/api/v1/nodes' && req.method() === 'POST') {
			saved = { ...req.postDataJSON(), id: view };
			return route.fulfill({ json: saved });
		}
		if (url.pathname === '/api/v1/nodes')
			return route.fulfill({
				json: url.searchParams.get('kind') === 'saved_view' ? (saved ? [saved] : []) : [a, b]
			});
		if (url.pathname.endsWith('/' + view)) return route.fulfill({ json: saved });
		if (url.pathname.endsWith('/' + first))
			return hide
				? route.fulfill({ status: 403 })
				: route.fulfill({ json: { ...a, title: 'Revised launch plan' } });
		return route.fulfill({ json: [] });
	});
	await page.goto('/workspace?view=canvas');
	const canvas = page.getByRole('application', { name: 'Canvas workspace' });
	const card = canvas.getByRole('button', { name: /Launch plan/ });
	await expect(card).toBeVisible();
	const box = (await card.boundingBox())!;
	await page.mouse.move(box.x + 25, box.y + 25);
	await page.mouse.down();
	await page.mouse.move(box.x + 61, box.y + 43);
	await page.mouse.up();
	const left = await card.evaluate((el) => el.style.left);
	expect(left).toBe('76px');
	await page.getByText('Choose cards (2)', { exact: true }).click();
	await page.getByRole('checkbox', { name: 'Other work' }).uncheck();
	await page.getByLabel('Canvas name').fill('Launch room');
	await page.getByRole('button', { name: 'Save a copy' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Saved Launch room' })).toBeVisible();
	expect(saved).toMatchObject({
		kind: 'saved_view',
		namespace: 'team',
		metadata: { canvas_layout: { cards: [{ id: first, x: 76, y: 58 }] } }
	});
	expect(JSON.stringify(saved)).not.toContain('Original text');
	await page.reload();
	await page.getByLabel('Open canvas').selectOption(view);
	const restored = canvas.getByRole('button', { name: /Revised launch plan/ });
	await expect(restored).toBeVisible();
	await expect(page).toHaveURL(new RegExp('canvas=' + view));
	await page.reload();
	await expect(restored).toBeVisible();
	const assistant = page.getByRole('complementary', { name: 'Workspace assistant' });
	await assistant.getByRole('button', { name: 'Ask about canvas · Launch room' }).click();
	for (const question of ['What is next?', 'Who should review it?']) {
		await assistant.getByLabel('Message').fill(question);
		await assistant.getByRole('button', { name: 'Send', exact: true }).click();
		await expect(assistant.getByLabel('Message')).toHaveValue('');
	}
	expect(questions.map((q) => q.path)).toEqual(Array(2).fill('/api/v1/canvases/' + view + '/chat'));
	expect(questions[1].body.history).toHaveLength(2);
	await assistant.getByRole('button', { name: 'Remove canvas · Launch room' }).click();
	await assistant.getByLabel('Message').fill('Search the vault');
	await assistant.getByRole('button', { name: 'Send', exact: true }).click();
	await expect(assistant.getByLabel('Message')).toHaveValue('');
	expect(questions[2]).toMatchObject({ path: '/api/v1/chat', body: { history: [] } });
	expect(await restored.evaluate((el) => el.style.left)).toBe(left);
	await expect(canvas.getByRole('button', { name: /Other work/ })).toHaveCount(0);
	await page.getByLabel('Open canvas').selectOption('');
	await expect(canvas.getByRole('button', { name: /Other work/ })).toBeVisible();
	hide = true;
	await page.getByLabel('Open canvas').selectOption(view);
	await expect(page.getByText(/1 saved card.*no longer available/)).toBeVisible();
	await expect(canvas.getByRole('button')).toHaveCount(0);

	await page.addInitScript(() => Object.defineProperty(window, 'isTauri', { value: true }));
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.reload();
	await page.getByRole('button', { name: 'Copy canvas name' }).click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Launch room · team');
});
