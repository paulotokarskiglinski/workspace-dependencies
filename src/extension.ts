import * as vscode from 'vscode';
import { DashboardPanel } from './webview/DashboardPanel';

export function activate(context: vscode.ExtensionContext) {
  console.log('Workspace Dependencies extension is now active!');

  let disposable = vscode.commands.registerCommand('workspaceDeps.openDashboard', () => {
    DashboardPanel.createOrShow(context.extensionUri);
  });

  context.subscriptions.push(disposable);
}

export function deactivate() { }
