import * as vscode from 'vscode';
import { DashboardPanel } from './webview/DashboardPanel';

export function activate(context: vscode.ExtensionContext) {
  console.log('Workspace Dependencies extension is now active!');

  let disposable = vscode.commands.registerCommand('workspaceDeps.openDashboard', () => {
    DashboardPanel.createOrShow(context.extensionUri);
  });

  context.subscriptions.push(disposable);

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'workspaceDeps.openDashboard';
  statusBarItem.text = '$(versions)';
  statusBarItem.tooltip = 'Open Workspace Dependencies Dashboard';
  statusBarItem.show();

  context.subscriptions.push(statusBarItem);
}

export function deactivate() { }
