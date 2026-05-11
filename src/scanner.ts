import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';

export interface PackageVersion {
  name: string;
  version: string;
}

export interface ProjectDependencies {
  projectPath: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

/**
 * Scans a given root directory for package.json files and extracts their dependencies.
 */
export async function scanLocalDependencies(rootDir: string, ignorePatterns: string[] = ['**/node_modules/**']): Promise<ProjectDependencies[]> {
  const searchPattern = path.join(rootDir, '**', 'package.json').replace(/\\/g, '/');

  const packageFiles = await glob(searchPattern, { ignore: ignorePatterns });

  const projects: ProjectDependencies[] = [];

  for (const file of packageFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const pkg = JSON.parse(content);

      projects.push({
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
