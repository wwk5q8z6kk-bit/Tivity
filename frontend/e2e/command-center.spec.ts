import { expect, test } from '@playwright/test';

test('keeps the open file and composer while switching workspace views', async ({ page }) => {
	const sent: string[] = [];
	await page.route('**/api/v1/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		const authorized = route.request().headers().authorization === 'Bearer vault-test';
		const doc = {
			workspace_id: 'ws',
			document_id: 'doc',
			relative_path: 'specs/launch.md',
			content: 'Friday release checklist',
			byte_size: 24,
			manifest_match: 'current'
		};
		if ((path.includes('/workspaces') || path.endsWith('/chat')) && !authorized)
			return route.fulfill({ status: 401 });
		if (path.endsWith('/workspaces'))
			return route.fulfill({ json: [{ id: 'ws', display_name: 'Team folder' }] });
		if (path.endsWith('/tree'))
			return route.fulfill({
				json: {
					workspace_id: 'ws',
					diagnostics: [],
					entries: [
						{ kind: 'directory', relative_path: 'specs', parent_path: null, name: 'specs' },
						{
							kind: 'document',
							relative_path: doc.relative_path,
							parent_path: 'specs',
							name: 'launch.md',
							document_id: 'doc',
							projection_state: 'ready'
						}
					]
				}
			});
		if (path.endsWith('/documents/doc')) return route.fulfill({ json: doc });
		if (path.endsWith('/chat')) {
			sent.push(route.request().postDataJSON().message);
			return route.fulfill({ json: { answer: 'Release on Friday.', sources: [] } });
		}
		return route.fulfill({ json: [] });
	});
	await page.goto('/workspace');
	await page.getByText('Vault access', { exact: true }).click();
	await page.getByLabel('Access token', { exact: true }).fill('vault-test');
	await page.getByRole('button', { name: 'Use token' }).click();
	const entry = page.getByRole('treeitem', { name: /launch.md/ });
	await page.getByRole('treeitem', { name: /specs/ }).click();
	await expect(entry).toHaveCount(0);
	await page.getByRole('treeitem', { name: /specs/ }).click();
	await entry.click();
	await expect(page.getByText('Friday release checklist', { exact: true })).toBeVisible();
	const assistant = page.getByRole('complementary', { name: 'Workspace assistant' });
	await assistant.getByLabel('Message').fill('What is due?');
	const nav = page.getByRole('navigation', { name: 'Workspace views' });
	await nav.getByRole('link', { name: 'Canvas' }).click();
	await expect(page.getByRole('heading', { name: 'Canvas', exact: true })).toBeVisible();
	await expect(assistant.getByLabel('Message')).toHaveValue('What is due?');
	await nav.getByRole('link', { name: 'Projects' }).click();
	await expect(
		page
			.frameLocator('iframe[title="Tivity delivery workspace"]')
			.getByRole('button', { name: 'Connect your first docs and tasks with links' })
	).toBeVisible();
	await nav.getByRole('link', { name: 'Files' }).click();
	await expect(page.getByText('Friday release checklist', { exact: true })).toBeVisible();
	await assistant.getByRole('button', { name: 'Send', exact: true }).click();
	await expect(assistant.getByRole('log')).toContainText('Release on Friday.');
	expect(sent).toEqual(['What is due?']);
	await assistant.getByRole('button', { name: /Attach excerpt/ }).click();
	await assistant.getByLabel('Message').fill('Summarize this');
	await assistant.getByRole('button', { name: 'Send', exact: true }).click();
	await expect.poll(() => sent.length).toBe(2);
	expect(sent[1]).toContain('Friday release checklist');
	await page.setViewportSize({ width: 390, height: 844 });
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
		.toBe(true);
	await page.getByRole('button', { name: 'Disconnect vault token' }).click();
	await expect(assistant.getByRole('log')).toHaveCount(0);
	await expect(page.getByText('Friday release checklist', { exact: true })).toHaveCount(0);
});
