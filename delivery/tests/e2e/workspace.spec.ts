import { expect, test } from '@playwright/test';

// Each test gets a fresh browser context, including isolated localStorage.
// These flows exercise the browser backend without touching the desktop DB.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome to Tivity' })).toBeVisible();
});

test('creates a task and keeps its status after reload', async ({ page }) => {
  await page.getByText('Add a task', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Task title' }).fill('Ship the browser regression suite');
  await page.locator('form').filter({ has: page.getByRole('textbox', { name: 'Task title' }) })
    .getByRole('button', { name: 'Add', exact: true }).click();

  const row = page.getByRole('listitem').filter({ hasText: 'Ship the browser regression suite' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(row.getByText('Doing', { exact: true })).toBeVisible();
  await page.reload();
  await expect(row.getByText('Doing', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(row.getByText('Done', { exact: true })).toBeVisible();
});

test('opens a linked document beside its task from Ask', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Ask', exact: true }).fill('Project notes');
  await page.getByRole('option', { name: 'docProject notes', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Selected task' });
  await expect(inspector.getByRole('heading', { name: 'Project notes' })).toBeVisible();
  await expect(inspector).toContainText('Everything here links together');
  await expect(page.getByRole('button', { name: 'Connect your first docs and tasks with links', exact: true }))
    .toHaveAttribute('aria-pressed', 'true');
});

test('opens an unlinked document in Library from Ask', async ({ page }) => {
  const record = page.getByRole('navigation', { name: 'Record' });
  await record.getByRole('button', { name: /^Library/ }).click();
  await page.getByText('Add a doc', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Standalone architecture');
  await page.getByRole('textbox', { name: 'Body', exact: true }).fill('Keep the SQLite core local.');
  await page.getByRole('button', { name: 'Add doc', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Standalone architecture' })).toBeVisible();
  await record.getByRole('button', { name: /^Connectors/ }).click();
  await page.getByRole('combobox', { name: 'Ask', exact: true }).fill('Standalone architecture');
  await page.getByRole('option', { name: 'docStandalone architecture', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Record' })
    .getByRole('button', { name: /^Library/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#work .focused')).toContainText('Standalone architecture');
  await expect(page.locator('#work .focused')).toContainText('Keep the SQLite core local.');
});

test('shows reference server launch commands and prerequisites', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Record' })
    .getByRole('button', { name: /^Connectors/ }).click();
  const bundle = page.locator('details.connector').filter({ hasText: 'Full MCP attach bundle' });
  await expect(bundle.locator('pre')).toContainText('"command": "uvx"');
  await expect(bundle.locator('pre')).toContainText('mcp-server-git');
  await expect(bundle.locator('pre')).toContainText('mcp-server-fetch');
  await expect(bundle).toContainText('Install Node');
  await expect(bundle).toContainText('uvx');
});

test('opens the add form by keyboard on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('n');
  await expect(page.getByRole('textbox', { name: 'Task title' })).toBeFocused();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});

test('keeps a task discussion after reload and separate from another task', async ({ page }) => {
  const title = 'Connect your first docs and tasks with links';
  await page.getByRole('button', { name: title, exact: true }).click();
  const discussion = page.getByRole('region', { name: 'Task discussion' });
  await expect(discussion.getByRole('textbox', { name: 'Comment' })).toBeVisible();
  await discussion.getByRole('textbox', { name: 'Name' }).fill('Alex');
  await discussion.getByRole('textbox', { name: 'Comment' }).fill('Keep the decision beside the work.');
  await discussion.getByRole('button', { name: 'Post comment' }).click();
  await expect(discussion.getByText('Keep the decision beside the work.')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(discussion.getByText('Alex', { exact: true })).toBeVisible();
  await expect(discussion.getByText('Keep the decision beside the work.')).toBeVisible();
  await page.getByText('Add a task', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Task title' }).fill('Another conversation');
  await page.locator('form').filter({ has: page.getByRole('textbox', { name: 'Task title' }) })
    .getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Another conversation', exact: true }).click();
  await expect(discussion.getByText('No comments yet.')).toBeVisible();
  await expect(discussion.getByText('Keep the decision beside the work.')).toHaveCount(0);
});
