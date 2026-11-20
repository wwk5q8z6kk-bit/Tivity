import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';

test('carries a specific run on a canvas and rechecks access for each reader', async ({ page }) => {
	const [orderId, runId, canvasId, cardId] = [1, 2, 3, 4].map(
		(n) => String(n).repeat(8) + '-1111-4111-8111-111111111111'
	);
	const card = {
		id: cardId,
		title: 'Release checklist',
		content: 'Confirm readiness',
		kind: 'task',
		tags: [],
		metadata: {},
		namespace: 'team'
	};
	const bytes = 'release evidence';
	const digest = createHash('sha256').update(bytes).digest('hex');
	let saved:
		| {
				id: string;
				metadata: {
					canvas_layout: { run?: { orderId: string; runId: string; fingerprint?: string } };
				};
		  }
		| undefined;
	let revoked = false;
	let checkOutcome = 'pass';
	let artifactBytes = bytes;
	await page.route('**/api/v1/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		const token = route.request().headers().authorization;
		if (path.startsWith('/api/v1/work-orders')) {
			if (token !== 'Bearer reviewer' || revoked) return route.fulfill({ status: 404 });
			const order = { work_order_id: orderId, goal: 'Verify release readiness' };
			if (path.endsWith('/work-orders')) return route.fulfill({ json: [order] });
			if (path.endsWith(orderId)) return route.fulfill({ json: { work_order: order } });
			if (path.endsWith('/runs'))
				return route.fulfill({ json: [{ run_id: runId, attempt_no: 2, status: 'completed' }] });
			if (path.endsWith('/evidence')) {
				expect(path).toContain('/runs/' + runId + '/');
				return route.fulfill({
					json: {
						revision: 'server-v1:' + (checkOutcome === 'pass' ? 'a' : 'b').repeat(64),
						order,
						run: { run_id: runId, attempt_no: 2, status: 'completed' },
						gates: [
							{
								gate: 'g2',
								outcome: checkOutcome,
								evaluator_actor: 'Release reviewer',
								evidence_digest: digest,
								evaluated_at: '2026-11-19T12:00:00Z'
							}
						],
						artifacts: [
							{
								artifact_id: 'a',
								run_id: runId,
								artifact_kind: 'Release evidence',
								content_digest: digest
							}
						]
					}
				});
			}
			if (path.endsWith('/content')) return route.fulfill({ body: artifactBytes });
		}
		if (path.endsWith('/nodes') && route.request().method() === 'POST') {
			saved = { ...route.request().postDataJSON(), id: canvasId };
			return route.fulfill({ json: saved });
		}
		if (path.endsWith('/nodes'))
			return route.fulfill({
				json:
					new URL(route.request().url()).searchParams.get('kind') === 'saved_view'
						? saved
							? [saved]
							: []
						: [card]
			});
		if (path.endsWith(canvasId)) return route.fulfill({ json: saved });
		if (path.endsWith(cardId)) return route.fulfill({ json: card });
		return route.fulfill({ json: [] });
	});
	await page.goto('/workspace?view=canvas');
	await page.getByText('Vault access', { exact: true }).click();
	await page.getByLabel('Access token').fill('reviewer');
	await page.getByRole('button', { name: 'Use token' }).click();
	await page.getByRole('button', { name: 'Link a work-order run' }).click();
	await page.getByRole('combobox', { name: 'Work order', exact: true }).selectOption(orderId);
	await page.getByRole('combobox', { name: 'Run', exact: true }).selectOption(runId);
	await page.getByRole('button', { name: 'Link run', exact: true }).click();
	await expect(page.getByText('Attempt 2 · completed')).toBeVisible();
	await page.getByRole('button', { name: 'Pin current evidence for a saved copy' }).click();
	await page.getByLabel('Canvas name').fill('Friday release');
	await page.getByRole('button', { name: 'Save a copy' }).click();
	await page.getByLabel('Open canvas').selectOption(canvasId);
	await expect(page).toHaveURL(new RegExp('canvas=' + canvasId));
	expect(saved?.metadata.canvas_layout.run).toEqual({
		orderId,
		runId,
		fingerprint: expect.stringMatching(/^server-v1:[0-9a-f]{64}$/)
	});
	expect(JSON.stringify(saved)).not.toContain('Verify release readiness');
	expect(page.url()).not.toContain('reviewer');
	await page.getByLabel('Message').fill('My release question');
	await page.getByRole('button', { name: 'Review linked run' }).click();
	await expect(page.getByText('Run evidence matches the pinned version.')).toBeVisible();
	await page.getByText('Output integrity', { exact: true }).click();
	await expect(page.getByText('Release reviewer', { exact: true })).toBeVisible();
	await expect(page.getByText('Other attempt')).toHaveCount(0);
	await page.getByRole('button', { name: 'Check artifact bytes' }).click();
	await expect(page.getByText('Digest matches')).toBeVisible();
	artifactBytes = 'changed content';
	await page.getByRole('button', { name: 'Check artifact bytes' }).click();
	await expect(page.getByText('Digest mismatch')).toBeVisible();
	await page.getByRole('button', { name: 'Close run review' }).click();
	await expect(page.getByLabel('Message')).toHaveValue('My release question');
	await expect(page.getByLabel('Open canvas')).toHaveValue(canvasId);
	revoked = true;
	await page.getByRole('button', { name: 'Review linked run' }).click();
	await expect(page.getByText(/Run evidence unavailable/)).toBeVisible();
	await expect(page.getByText('Release reviewer', { exact: true })).toHaveCount(0);
	revoked = false;
	checkOutcome = 'fail';
	await page.getByRole('button', { name: 'Close run review' }).click();
	await page.getByRole('button', { name: 'Review linked run' }).click();
	await expect(page.getByText('Verify release readiness', { exact: true })).toBeVisible();
	await expect(page.getByText(/Run evidence has changed since it was pinned/)).toBeVisible();
	await expect(page.getByText('Failed', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Disconnect vault token' }).click();
	await expect(page.getByText('Verify release readiness', { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Review linked run' }).click();
	await expect(page.getByText(/Run evidence unavailable/)).toBeVisible();
	await page.goto('/delivery');
	await page.getByRole('button', { name: 'Shared task discussions' }).click();
	const thread = page.getByRole('region', { name: 'Shared task discussions' });
	await thread.getByLabel('Vault namespace').fill('team');
	await thread.getByLabel('Vault access token').fill('reviewer');
	await thread.getByRole('button', { name: 'Load tasks' }).click();
	await thread.getByRole('button', { name: 'Find linked reviews' }).click();
	await thread.getByRole('link', { name: 'Friday release' }).click();
	await expect(page).toHaveURL(new RegExp('canvas=' + canvasId));
});
