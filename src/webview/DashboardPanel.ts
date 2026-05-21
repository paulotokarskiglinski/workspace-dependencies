import * as vscode from 'vscode';
import { scanLocalDependencies } from '../scanner';
import { getPackageJsonFromBranch, findGitRoot } from '../gitUtils';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Resolves a path, expanding `~` to the home directory, and treating relative paths
 * as relative to the provided workspaceRoot directory.
 */
function resolvePath(p: string, workspaceRoot?: string): string {
  if (p.startsWith('~')) {
    p = path.join(os.homedir(), p.slice(1));
  }
  if (!path.isAbsolute(p) && workspaceRoot) {
    p = path.resolve(workspaceRoot, p);
  }
  return path.normalize(p);
}

/**
 * Determines status (Sync, Mismatch, N/A) based on comparing Current, Dev, and Main branch versions.
 */
function getStatus(curr: string, dev: string, main: string): string {
  if (curr === '-' && dev === '-' && main === '-') {
    return 'N/A';
  }
  const hasDev = dev !== '-';
  const hasMain = main !== '-';

  if (!hasDev && !hasMain) {
    return '✅ Sync';
  }
  if (!hasDev && hasMain) {
    return curr === main ? '✅ Sync' : '⚠️ Mismatch';
  }
  if (hasDev && !hasMain) {
    return curr === dev ? '✅ Sync' : '⚠️ Mismatch';
  }
  return (curr === dev && curr === main) ? '✅ Sync' : '⚠️ Mismatch';
}

/**
 * Helper to get the union of keys from multiple dependency objects.
 */
function getUnionKeys(...objects: (Record<string, any> | undefined | null)[]): string[] {
  const keys = new Set<string>();
  for (const obj of objects) {
    if (obj) {
      for (const key of Object.keys(obj)) {
        keys.add(key);
      }
    }
  }
  return Array.from(keys).sort();
}

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
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist'),
          vscode.Uri.joinPath(extensionUri, 'src', 'assets')
        ]
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
    
    if (deps['next']) return { framework: 'Next.js', version: deps['next'] };
    if (deps['nuxt'] || deps['nuxt3']) return { framework: 'Nuxt.js', version: deps['nuxt'] || deps['nuxt3'] };
    if (deps['@sveltejs/kit']) return { framework: 'SvelteKit', version: deps['@sveltejs/kit'] };
    if (deps['svelte']) return { framework: 'Svelte', version: deps['svelte'] };
    if (deps['ember-source']) return { framework: 'Ember', version: deps['ember-source'] };
    if (deps['ember-cli']) return { framework: 'Ember', version: deps['ember-cli'] };

    if (deps['@angular/core']) return { framework: 'Angular', version: deps['@angular/core'] };
    if (deps['react']) return { framework: 'React', version: deps['react'] };
    if (deps['vue']) return { framework: 'Vue', version: deps['vue'] };
    if (deps['typescript']) return { framework: 'TypeScript', version: deps['typescript'] };
    
    return { framework: 'JavaScript', version: '-' };
  }

  private _getFrameworkIconUri(framework: string): string | null {
    const iconMap: Record<string, string> = {
      'Angular': 'angular.svg',
      'React': 'react.svg',
      'Next.js': 'nextjs.svg',
      'Nuxt.js': 'nuxtjs.svg',
      'Svelte': 'svelte.svg',
      'SvelteKit': 'svelte.svg',
      'Ember': 'ember.svg',
      'JavaScript': 'javascript.svg',
      'TypeScript': 'typescript.svg'
    };
    const iconName = iconMap[framework];
    if (iconName) {
      const onDiskPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'assets', iconName);
      return this._panel.webview.asWebviewUri(onDiskPath).toString();
    }
    return null;
  }

  private async _update() {
    const webview = this._panel.webview;
    this._panel.title = "Scanning...";
    webview.html = this._getHtmlForLoading();

    try {
      const scanTargets = new Set<string>();
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        scanTargets.add(path.normalize(workspaceRoot));
      }

      const config = vscode.workspace.getConfiguration('workspaceDependencies');
      const watchedDirectoriesConfig = config.get<string[]>('watchedDirectories') || [];
      for (const p of watchedDirectoriesConfig) {
        if (p.trim()) {
          const resolved = resolvePath(p.trim(), workspaceRoot);
          if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
            scanTargets.add(resolved);
          } else {
            console.warn(`Watched directory does not exist or is not a directory: ${resolved}`);
          }
        }
      }

      if (scanTargets.size === 0) {
        webview.html = this._getHtmlForError("No workspace open and no watched directories configured. Please open a workspace or configure 'workspaceDependencies.watchedDirectories'.");
        this._panel.title = "Workspace Dependencies";
        return;
      }

      const allProjects: { project: any; scanRoot: string }[] = [];
      for (const target of scanTargets) {
        try {
          const targetProjects = await scanLocalDependencies(target);
          for (const tp of targetProjects) {
            allProjects.push({ project: tp, scanRoot: target });
          }
        } catch (scanErr) {
          console.error(`Failed to scan target ${target}:`, scanErr);
        }
      }

      // Deduplicate projects by projectPath
      const seenPaths = new Set<string>();
      const deduplicatedProjects = [];
      for (const item of allProjects) {
        const normalizedPath = path.normalize(item.project.projectPath);
        if (!seenPaths.has(normalizedPath)) {
          seenPaths.add(normalizedPath);
          deduplicatedProjects.push(item);
        }
      }

      const projectDataList = [];
      let mainBranchName = 'origin/main';
      let devBranchName = 'origin/dev';

      for (const { project, scanRoot } of deduplicatedProjects) {
        // Compute path display
        let relativeDir = '';
        let displayPath = '';
        if (workspaceRoot && project.projectPath.startsWith(workspaceRoot)) {
          relativeDir = path.relative(workspaceRoot, project.projectPath);
          displayPath = relativeDir ? `Workspace/${relativeDir}` : 'Workspace Root';
        } else {
          const baseName = path.basename(scanRoot);
          relativeDir = path.relative(scanRoot, project.projectPath);
          displayPath = relativeDir ? `${baseName}/${relativeDir}` : baseName;
        }
        displayPath = displayPath.replace(/\\/g, '/');

        // Git root detection
        const gitRoot = await findGitRoot(project.projectPath);
        let mainBranchPkg: any = null;
        let devBranchPkg: any = null;

        if (gitRoot) {
          const relativeToGitRoot = path.relative(gitRoot, project.projectPath);
          const packageJsonRelativePath = relativeToGitRoot ? path.join(relativeToGitRoot, 'package.json') : 'package.json';

          mainBranchPkg = await getPackageJsonFromBranch(gitRoot, 'origin/main', packageJsonRelativePath);
          if (!mainBranchPkg) {
            mainBranchPkg = await getPackageJsonFromBranch(gitRoot, 'origin/master', packageJsonRelativePath);
            if (mainBranchPkg) mainBranchName = 'origin/master';
          }

          devBranchPkg = await getPackageJsonFromBranch(gitRoot, 'origin/dev', packageJsonRelativePath);
          if (!devBranchPkg) {
            devBranchPkg = await getPackageJsonFromBranch(gitRoot, 'origin/develop', packageJsonRelativePath);
            if (devBranchPkg) devBranchName = 'origin/develop';
          }
        }

        const localPkgMock = { dependencies: project.dependencies, devDependencies: project.devDependencies };
        const localFw = this._getFrameworkInfo(localPkgMock);
        const devFw = devBranchPkg ? this._getFrameworkInfo(devBranchPkg) : { framework: localFw.framework, version: '-' };
        const mainFw = mainBranchPkg ? this._getFrameworkInfo(mainBranchPkg) : { framework: localFw.framework, version: '-' };

        // Map regular dependencies
        const depKeys = getUnionKeys(
          project.dependencies,
          devBranchPkg?.dependencies,
          mainBranchPkg?.dependencies
        );
        const dependenciesList = depKeys.map(pkgName => {
          const localVer = project.dependencies[pkgName] || '-';
          const devVer = devBranchPkg?.dependencies?.[pkgName] || '-';
          const mainVer = mainBranchPkg?.dependencies?.[pkgName] || '-';
          return {
            name: pkgName,
            local: localVer,
            dev: devVer,
            main: mainVer,
            status: getStatus(localVer, devVer, mainVer)
          };
        });

        // Map dev dependencies
        const devDepKeys = getUnionKeys(
          project.devDependencies,
          devBranchPkg?.devDependencies,
          mainBranchPkg?.devDependencies
        );
        const devDependenciesList = devDepKeys.map(pkgName => {
          const localVer = project.devDependencies[pkgName] || '-';
          const devVer = devBranchPkg?.devDependencies?.[pkgName] || '-';
          const mainVer = mainBranchPkg?.devDependencies?.[pkgName] || '-';
          return {
            name: pkgName,
            local: localVer,
            dev: devVer,
            main: mainVer,
            status: getStatus(localVer, devVer, mainVer)
          };
        });

        projectDataList.push({
          name: project.name || (relativeDir || path.basename(project.projectPath)),
          path: displayPath,
          framework: localFw.framework,
          frameworkIcon: this._getFrameworkIconUri(localFw.framework),
          localVersion: localFw.version,
          devVersion: devFw.version,
          mainVersion: mainFw.version,
          status: getStatus(localFw.version, devFw.version, mainFw.version),
          dependencies: dependenciesList,
          devDependencies: devDependenciesList
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
                th.sortable {
                    cursor: pointer;
                    user-select: none;
                }
                th.sortable:hover {
                    background-color: var(--vscode-list-hoverBackground);
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
                <table id="projects-table">
                    <thead>
                        <tr>
                            <th data-sort="name" class="sortable" onclick="sortData('projects', 'name')">Project Name</th>
                            <th data-sort="framework" class="sortable" onclick="sortData('projects', 'framework')">Framework</th>
                            <th data-sort="localVersion" class="sortable" onclick="sortData('projects', 'localVersion')">Current Branch</th>
                            <th data-sort="devVersion" class="sortable" onclick="sortData('projects', 'devVersion')">${devBranchName} Version</th>
                            <th data-sort="mainVersion" class="sortable" onclick="sortData('projects', 'mainVersion')">${mainBranchName} Version</th>
                            <th data-sort="status" class="sortable" onclick="sortData('projects', 'status')">Status</th>
                        </tr>
                    </thead>
                    <tbody id="projects-tbody">
                    </tbody>
                </table>
            </div>

            <div id="project-details-view" class="hidden">
                <button class="back-button" onclick="showProjectList()">⬅️ Back to Projects List</button>
                <h2 id="details-title">Project Details</h2>
                
                <h3>Dependencies</h3>
                <table id="dependencies-table">
                    <thead>
                        <tr>
                            <th data-sort="name" class="sortable" onclick="sortData('dependencies', 'name')">Package Name</th>
                            <th data-sort="local" class="sortable" onclick="sortData('dependencies', 'local')">Current Branch</th>
                            <th data-sort="dev" class="sortable" onclick="sortData('dependencies', 'dev')">${devBranchName} Version</th>
                            <th data-sort="main" class="sortable" onclick="sortData('dependencies', 'main')">${mainBranchName} Version</th>
                            <th data-sort="status" class="sortable" onclick="sortData('dependencies', 'status')">Status</th>
                        </tr>
                    </thead>
                    <tbody id="dependencies-tbody">
                    </tbody>
                </table>

                <h3 style="margin-top: 40px;">Development Dependencies</h3>
                <table id="devDependencies-table">
                    <thead>
                        <tr>
                            <th data-sort="name" class="sortable" onclick="sortData('devDependencies', 'name')">Package Name</th>
                            <th data-sort="local" class="sortable" onclick="sortData('devDependencies', 'local')">Current Branch</th>
                            <th data-sort="dev" class="sortable" onclick="sortData('devDependencies', 'dev')">${devBranchName} Version</th>
                            <th data-sort="main" class="sortable" onclick="sortData('devDependencies', 'main')">${mainBranchName} Version</th>
                            <th data-sort="status" class="sortable" onclick="sortData('devDependencies', 'status')">Status</th>
                        </tr>
                    </thead>
                    <tbody id="devDependencies-tbody">
                    </tbody>
                </table>
            </div>

            <script>
                const projectsData = ${dataJson};
                
                const listTbody = document.getElementById('projects-tbody');
                const dependenciesTbody = document.getElementById('dependencies-tbody');
                const devDependenciesTbody = document.getElementById('devDependencies-tbody');
                const listView = document.getElementById('project-list-view');
                const detailsView = document.getElementById('project-details-view');
                const detailsTitle = document.getElementById('details-title');

                let currentProjectIndex = null;
                const sortState = {
                    projects: { column: null, direction: 1 },
                    dependencies: { column: null, direction: 1 },
                    devDependencies: { column: null, direction: 1 }
                };

                function renderProjects() {
                    listTbody.innerHTML = '';
                    projectsData.forEach((project, index) => {
                        const tr = document.createElement('tr');
                        tr.className = 'clickable';
                        tr.onclick = () => showProjectDetails(index);
                        const iconHtml = project.frameworkIcon 
                            ? \`<img src="\${project.frameworkIcon}" alt="\${project.framework} logo" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 8px;">\` 
                            : '';
                        tr.innerHTML = \`
                            <td><strong>\${project.name}</strong><br><small>\${project.path}</small></td>
                            <td>\${iconHtml}\${project.framework}</td>
                            <td>\${project.localVersion}</td>
                            <td>\${project.devVersion}</td>
                            <td>\${project.mainVersion}</td>
                            <td>\${project.status}</td>
                        \`;
                        listTbody.appendChild(tr);
                    });
                }

                function renderDependencies(project) {
                    dependenciesTbody.innerHTML = '';
                    if (project.dependencies.length === 0) {
                        dependenciesTbody.innerHTML = '<tr><td colspan="5">No dependencies found.</td></tr>';
                    } else {
                        project.dependencies.forEach(pkg => {
                            const tr = document.createElement('tr');
                            tr.innerHTML = \`
                                <td>\${pkg.name}</td>
                                <td>\${pkg.local}</td>
                                <td>\${pkg.dev}</td>
                                <td>\${pkg.main}</td>
                                <td>\${pkg.status}</td>
                            \`;
                            dependenciesTbody.appendChild(tr);
                        });
                    }
                }

                function renderDevDependencies(project) {
                    devDependenciesTbody.innerHTML = '';
                    if (project.devDependencies.length === 0) {
                        devDependenciesTbody.innerHTML = '<tr><td colspan="5">No development dependencies found.</td></tr>';
                    } else {
                        project.devDependencies.forEach(pkg => {
                            const tr = document.createElement('tr');
                            tr.innerHTML = \`
                                <td>\${pkg.name}</td>
                                <td>\${pkg.local}</td>
                                <td>\${pkg.dev}</td>
                                <td>\${pkg.main}</td>
                                <td>\${pkg.status}</td>
                            \`;
                            devDependenciesTbody.appendChild(tr);
                        });
                    }
                }

                function updateHeaderIcons(tableId, column, direction) {
                    const table = document.getElementById(tableId);
                    const ths = table.querySelectorAll('th[data-sort]');
                    ths.forEach(th => {
                        th.innerText = th.innerText.replace(' 🞁', '').replace(' 🞃', '');
                        if (th.getAttribute('data-sort') === column) {
                            th.innerText += direction === 1 ? ' 🞁' : ' 🞃';
                        }
                    });
                }

                function sortData(type, column) {
                    let dataArray = [];
                    let renderFn = null;
                    let tableId = '';

                    if (type === 'projects') {
                        dataArray = projectsData;
                        renderFn = renderProjects;
                        tableId = 'projects-table';
                    } else if (type === 'dependencies' && currentProjectIndex !== null) {
                        dataArray = projectsData[currentProjectIndex].dependencies;
                        renderFn = () => renderDependencies(projectsData[currentProjectIndex]);
                        tableId = 'dependencies-table';
                    } else if (type === 'devDependencies' && currentProjectIndex !== null) {
                        dataArray = projectsData[currentProjectIndex].devDependencies;
                        renderFn = () => renderDevDependencies(projectsData[currentProjectIndex]);
                        tableId = 'devDependencies-table';
                    } else {
                        return;
                    }

                    if (sortState[type].column === column) {
                        sortState[type].direction *= -1;
                    } else {
                        sortState[type].column = column;
                        sortState[type].direction = 1;
                    }

                    const dir = sortState[type].direction;
                    dataArray.sort((a, b) => {
                        let valA = a[column];
                        let valB = b[column];
                        if (typeof valA === 'string') valA = valA.toLowerCase();
                        if (typeof valB === 'string') valB = valB.toLowerCase();

                        if (valA < valB) return -1 * dir;
                        if (valA > valB) return 1 * dir;
                        return 0;
                    });

                    renderFn();
                    updateHeaderIcons(tableId, column, dir);
                }

                function showProjectDetails(index) {
                    currentProjectIndex = index;
                    const project = projectsData[index];
                    detailsTitle.innerText = \`Dependencies for: \${project.name}\`;
                    
                    // Apply sort state if returning to this view or if changing projects (will apply current sort rule)
                    if (sortState.dependencies.column) {
                         const dir = sortState.dependencies.direction;
                         const col = sortState.dependencies.column;
                         project.dependencies.sort((a, b) => {
                             let valA = a[col]; let valB = b[col];
                             if (typeof valA === 'string') valA = valA.toLowerCase();
                             if (typeof valB === 'string') valB = valB.toLowerCase();
                             if (valA < valB) return -1 * dir;
                             if (valA > valB) return 1 * dir;
                             return 0;
                         });
                    }
                    if (sortState.devDependencies.column) {
                         const dir = sortState.devDependencies.direction;
                         const col = sortState.devDependencies.column;
                         project.devDependencies.sort((a, b) => {
                             let valA = a[col]; let valB = b[col];
                             if (typeof valA === 'string') valA = valA.toLowerCase();
                             if (typeof valB === 'string') valB = valB.toLowerCase();
                             if (valA < valB) return -1 * dir;
                             if (valA > valB) return 1 * dir;
                             return 0;
                         });
                    }

                    renderDependencies(project);
                    renderDevDependencies(project);

                    updateHeaderIcons('dependencies-table', sortState.dependencies.column, sortState.dependencies.direction);
                    updateHeaderIcons('devDependencies-table', sortState.devDependencies.column, sortState.devDependencies.direction);

                    listView.classList.add('hidden');
                    detailsView.classList.remove('hidden');
                }

                function showProjectList() {
                    detailsView.classList.add('hidden');
                    listView.classList.remove('hidden');
                }

                // Initial render
                renderProjects();
            </script>
        </body>
        </html>`;
  }
}
