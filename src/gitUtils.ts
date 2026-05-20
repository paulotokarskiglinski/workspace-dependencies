import { simpleGit, SimpleGit } from 'simple-git';
import * as path from 'path';

/**
 * Finds the nearest Git repository root for a given directory.
 * Runs `git rev-parse --show-toplevel` within that directory.
 */
export async function findGitRoot(dir: string): Promise<string | null> {
  const git: SimpleGit = simpleGit(dir);
  try {
    const toplevel = await git.revparse(['--show-toplevel']);
    return path.normalize(toplevel.trim());
  } catch {
    return null;
  }
}

/**
 * Fetches the contents of a package.json file from a specific branch in the repository.
 * Uses `git show branch:path/to/package.json`
 */
export async function getPackageJsonFromBranch(repoPath: string, branch: string, relativeFilePath: string): Promise<any | null> {
  const git: SimpleGit = simpleGit(repoPath);

  try {
    // Ensure the path uses forward slashes for git
    const gitPath = relativeFilePath.replace(/\\/g, '/');
    // e.g. git show origin/main:sub-project/package.json
    const content = await git.show([`${branch}:${gitPath}`]);
    return JSON.parse(content);
  } catch (error) {
    // This is expected if the branch doesn't exist, or the file doesn't exist on that branch
    return null;
  }
}
