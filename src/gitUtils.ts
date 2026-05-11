import { simpleGit, SimpleGit } from 'simple-git';

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
