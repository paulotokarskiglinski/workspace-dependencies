import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';

export interface PackageVersion {
  name: string;
  version: string;
}

export interface ProjectDependencies {
  name: string;
  projectPath: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

/**
 * Scans a given root directory for package.json files and extracts their dependencies.
 */
export async function scanLocalDependencies(rootDir: string, ignorePatterns: string[] = ['**/node_modules/**', '**/dist/**', '**/src/**']): Promise<ProjectDependencies[]> {
  const packageFiles = await glob(['package.json', '*/package.json'], {
    cwd: rootDir,
    absolute: true,
    ignore: ignorePatterns
  });

  const projects: ProjectDependencies[] = [];

  for (const file of packageFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const pkg = JSON.parse(content);

      projects.push({
        name: pkg.name || path.basename(path.dirname(file)),
        projectPath: path.dirname(file),
        dependencies: pkg.dependencies || {},
        devDependencies: pkg.devDependencies || {}
      });
    } catch (error) {
      console.error(`Failed to parse ${file}:`, error);
    }
  }

  return projects;
}
