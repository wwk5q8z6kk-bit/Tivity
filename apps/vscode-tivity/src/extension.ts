import * as vscode from 'vscode';
import { openIdeStore } from '@tivity/ide-client';
import {
  createTaskCommand,
  listTasksCommand,
  recordMemoryCommand,
  searchCommand,
  showImpactCommand,
  type IdeConfig,
  type IdeUi,
} from './commands';

// Thin adapter: real vscode API in, shared command logic out. Runs only
// inside VS Code (or a fork) — verified by typecheck + bundle, not by
// headless tests; commands.ts carries the tested logic.

const ui: IdeUi = {
  showInput: async (prompt, placeholder) =>
    vscode.window.showInputBox({ prompt, placeHolder: placeholder }),
  showPick: async (items, prompt) => vscode.window.showQuickPick(items, { placeHolder: prompt }),
  showInfo: async (message) => {
    await vscode.window.showInformationMessage(message);
  },
  showError: async (message) => {
    await vscode.window.showErrorMessage(message);
  },
};

function readConfig(): IdeConfig {
  const config = vscode.workspace.getConfiguration('tivity');
  return { dbPath: config.get<string>('dbPath', ''), project: config.get<string>('project', '') };
}

export function activate(context: vscode.ExtensionContext): void {
  const config = (): IdeConfig => readConfig();
  context.subscriptions.push(
    vscode.commands.registerCommand('tivity.search', () => searchCommand(ui, config(), openIdeStore)),
    vscode.commands.registerCommand('tivity.listTasks', () => listTasksCommand(ui, config(), openIdeStore)),
    vscode.commands.registerCommand('tivity.createTask', () => createTaskCommand(ui, config(), openIdeStore)),
    vscode.commands.registerCommand('tivity.recordMemory', () => recordMemoryCommand(ui, config(), openIdeStore)),
    vscode.commands.registerCommand('tivity.showImpact', () => showImpactCommand(ui, config(), openIdeStore)),
  );
}

export function deactivate(): void {
  // No background work: every command opens, runs, and closes the database.
}
