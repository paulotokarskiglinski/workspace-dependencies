# Workspace Dependencies

**Workspace Dependencies** is a VS Code extension designed to help you track NPM package versions across multiple projects and Git branches. It provides an intuitive dashboard to instantly see if your local packages are synchronized with your development and production branches.

## Features

- **Multi-Project Scanning**: Automatically scans your active VS Code workspace and any additionally configured directories for `package.json` files.
- **Git Branch Comparison**: Compares your local dependencies and `devDependencies` against the `origin/dev` (or `develop`) and `origin/main` (or `master`) branches.
- **Visual Dashboard**: Displays a comprehensive Webview dashboard inside VS Code with sortable tables.
- **Framework Detection**: Automatically detects your frontend framework (React, Next.js, Vue, Nuxt.js, Angular, Svelte/SvelteKit, Ember).
- **Mismatch Detection**: Instantly highlights if any dependency is out of sync between your local environment, the dev branch, or the main branch.

## How to Use

1. Open a workspace or project folder in VS Code.
2. Open the Command Palette (`Ctrl+Shift+P` on Windows/Linux, `Cmd+Shift+P` on macOS).
3. Run the command: **`Workspace Dependencies: Open Dashboard`**.
4. The dashboard will scan your projects and display the version matrix and synchronization status for all packages.
5. Click on any row in the main dashboard to view the detailed package-by-package breakdown for that specific project.

## Configuration

You can configure the extension via your VS Code Settings (`settings.json`):

- **`workspaceDependencies.watchedDirectories`**: An array of additional directory paths you want to scan for projects. 
  - *Example*: `["~/Projects/shared-libraries", "./legacy-apps"]`
  - *Note*: These folders will be scanned for `package.json` at their root and one level deep. Absolute paths, relative paths, and home directory (`~`) paths are fully supported.

## Requirements

- VS Code version `1.80.0` or higher.
- `git` must be installed and accessible in your system path (to fetch branch file versions).

## License

MIT
