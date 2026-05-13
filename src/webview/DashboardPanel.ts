import * as vscode from 'vscode';
import { scanLocalDependencies } from '../scanner';
import { getPackageJsonFromBranch } from '../gitUtils';
import * as path from 'path';

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  public static readonly viewType = 'workspaceDepsDashboard';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DashboardPanel.viewType,
      'Workspace Dependencies',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')]
      }
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public dispose() {
    DashboardPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getFrameworkInfo(pkg: any): { framework: string, version: string } {
    const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
    if (deps['@angular/core']) return { framework: 'Angular', version: deps['@angular/core'] };
    if (deps['react']) return { framework: 'React', version: deps['react'] };
    if (deps['vue']) return { framework: 'Vue', version: deps['vue'] };
    if (deps['typescript']) return { framework: 'TypeScript', version: deps['typescript'] };
    return { framework: 'JavaScript', version: '-' };
  }

  private async _update() {
    const webview = this._panel.webview;
    this._panel.title = "Scanning...";
    webview.html = this._getHtmlForLoading();

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      webview.html = this._getHtmlForError("No workspace folder open.");
      this._panel.title = "Workspace Dependencies";
      return;
    }

    const targetDir = workspaceFolders[0].uri.fsPath;

    try {
      const projects = await scanLocalDependencies(targetDir);
      const projectDataList = [];

      let mainBranchName = 'origin/main';
      let devBranchName = 'origin/dev';

      for (const project of projects) {
        const relativeDir = path.relative(targetDir, project.projectPath);
        const packageJsonRelativePath = relativeDir ? path.join(relativeDir, 'package.json') : 'package.json';

        let mainBranchPkg = await getPackageJsonFromBranch(targetDir, 'origin/main', packageJsonRelativePath);
        if (!mainBranchPkg) {
          mainBranchPkg = await getPackageJsonFromBranch(targetDir, 'origin/master', packageJsonRelativePath);
          if (mainBranchPkg) mainBranchName = 'origin/master';
        }

        let devBranchPkg = await getPackageJsonFromBranch(targetDir, 'origin/dev', packageJsonRelativePath);
        if (!devBranchPkg) {
          devBranchPkg = await getPackageJsonFromBranch(targetDir, 'origin/develop', packageJsonRelativePath);
          if (devBranchPkg) devBranchName = 'origin/develop';
        }

        const localPkgMock = { dependencies: project.dependencies, devDependencies: project.devDependencies };
        const localFw = this._getFrameworkInfo(localPkgMock);
        const devFw = devBranchPkg ? this._getFrameworkInfo(devBranchPkg) : { framework: localFw.framework, version: '-' };
        const mainFw = mainBranchPkg ? this._getFrameworkInfo(mainBranchPkg) : { framework: localFw.framework, version: '-' };

        const packagesToTrack = ['@angular/core', '@angular/cli', 'typescript', 'rxjs', 'react', 'react-dom', 'vue', 'vite'];
        const packagesList = [];

        for (const pkgName of packagesToTrack) {
          const localVer = project.dependencies[pkgName] || project.devDependencies[pkgName] || '-';
          const devVer = devBranchPkg ? (devBranchPkg.dependencies?.[pkgName] || devBranchPkg.devDependencies?.[pkgName] || '-') : '-';
          const mainVer = mainBranchPkg ? (mainBranchPkg.dependencies?.[pkgName] || mainBranchPkg.devDependencies?.[pkgName] || '-') : '-';

          const status = (localVer === mainVer && localVer === devVer) ? '✅ Sync' : (localVer === '-' && mainVer === '-' && devVer === '-' ? 'N/A' : '⚠️ Mismatch');

          if (localVer !== '-' || devVer !== '-' || mainVer !== '-') {
            packagesList.push({
              name: pkgName,
              local: localVer,
              dev: devVer,
              main: mainVer,
              status: status
            });
          }
        }

        projectDataList.push({
          name: project.name || (relativeDir || 'Root'),
          path: relativeDir || 'Root',
          framework: localFw.framework,
          localVersion: localFw.version,
          devVersion: devFw.version,
          mainVersion: mainFw.version,
          packages: packagesList
        });
      }

      this._panel.title = "Workspace Dependencies";
      webview.html = this._getHtmlForWebview(projectDataList, devBranchName, mainBranchName);
    } catch (err: any) {
      this._panel.title = "Error";
      webview.html = this._getHtmlForError(err.message);
    }
  }

  private _getHtmlForLoading() {
    return `<!DOCTYPE html>
        <html lang="en">
        <body>
            <h2>Scanning Workspace Dependencies...</h2>
            <p>This might take a few seconds.</p>
        </body>
        </html>`;
  }

  private _getHtmlForError(error: string) {
    return `<!DOCTYPE html>
        <html lang="en">
        <body>
            <h2>Error Scanning Dependencies</h2>
            <p style="color: red;">${error}</p>
        </body>
        </html>`;
  }

  private _getHtmlForWebview(projects: any[], devBranchName: string, mainBranchName: string) {
    const dataJson = JSON.stringify(projects);

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Workspace Dependencies</title>
            <style>
                body {
                    padding: 20px;
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                    font-family: var(--vscode-font-family);
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }
                th, td {
                    text-align: left;
                    padding: 12px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                th {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    font-weight: 600;
                }
                tr.clickable:hover {
                    background-color: var(--vscode-list-hoverBackground);
                    cursor: pointer;
                }
                .hidden {
                    display: none;
                }
                .back-button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    cursor: pointer;
                    margin-bottom: 20px;
                    border-radius: 2px;
                }
                .back-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div id="project-list-view">
                <h2>Projects Dashboard</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Project Name</th>
                            <th>Framework</th>
                            <th>Local Version</th>
                            <th>${devBranchName} Version</th>
                            <th>${mainBranchName} Version</th>
                        </tr>
                    </thead>
                    <tbody id="projects-tbody">
                    </tbody>
                </table>
            </div>

            <div id="project-details-view" class="hidden">
                <button class="back-button" onclick="showProjectList()">⬅️ Back to Projects List</button>
                <h2 id="details-title">Project Details</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Package Name</th>
                            <th>Local Version</th>
                            <th>${devBranchName} Version</th>
                            <th>${mainBranchName} Version</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="details-tbody">
                    </tbody>
                </table>
            </div>

            <script>
                const projectsData = ${dataJson};
                
                const listTbody = document.getElementById('projects-tbody');
                const detailsTbody = document.getElementById('details-tbody');
                const listView = document.getElementById('project-list-view');
                const detailsView = document.getElementById('project-details-view');
                const detailsTitle = document.getElementById('details-title');

                // Render project list
                projectsData.forEach((project, index) => {
                    const tr = document.createElement('tr');
                    tr.className = 'clickable';
                    tr.onclick = () => showProjectDetails(index);
                    tr.innerHTML = \`
                        <td><strong>\${project.name}</strong><br><small>\${project.path}</small></td>
                        <td>\${project.framework}</td>
                        <td>\${project.localVersion}</td>
                        <td>\${project.devVersion}</td>
                        <td>\${project.mainVersion}</td>
                    \`;
                    listTbody.appendChild(tr);
                });

                function showProjectDetails(index) {
                    const project = projectsData[index];
                    detailsTitle.innerText = \`Dependencies for: \${project.name}\`;
                    
                    detailsTbody.innerHTML = '';
                    if (project.packages.length === 0) {
                        detailsTbody.innerHTML = '<tr><td colspan="5">No tracked packages found.</td></tr>';
                    } else {
                        project.packages.forEach(pkg => {
                            const tr = document.createElement('tr');
                            tr.innerHTML = \`
                                <td>\${pkg.name}</td>
                                <td>\${pkg.local}</td>
                                <td>\${pkg.dev}</td>
                                <td>\${pkg.main}</td>
                                <td>\${pkg.status}</td>
                            \`;
                            detailsTbody.appendChild(tr);
                        });
                    }

                    listView.classList.add('hidden');
                    detailsView.classList.remove('hidden');
                }

                function showProjectList() {
                    detailsView.classList.add('hidden');
                    listView.classList.remove('hidden');
                }
            </script>
        </body>
        </html>`;
  }
}
