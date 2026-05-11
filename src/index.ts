import { scanLocalDependencies } from './scanner';
import { getPackageJsonFromBranch } from './gitUtils';
import * as path from 'path';

async function main() {
  console.log("🚀 Starting Workspace Dependencies CLI...");

  // Default to the current directory
  const targetDir = process.cwd();
  console.log(`Scanning local projects in: ${targetDir}`);

  const projects = await scanLocalDependencies(targetDir);

  console.log(`Found ${projects.length} package.json files.\n`);

  for (const project of projects) {
    console.log(`📦 Project: ${project.projectPath}`);

    // Calculate the relative path from the Git root (assuming targetDir is the Git root)
    const relativeDir = path.relative(targetDir, project.projectPath);
    const packageJsonRelativePath = relativeDir ? path.join(relativeDir, 'package.json') : 'package.json';

    // Fetch package.json from the 'main' or 'master' branch
    let mainBranchPkg = await getPackageJsonFromBranch(targetDir, 'origin/main', packageJsonRelativePath);
    let branchName = 'origin/main';

    if (!mainBranchPkg) {
      mainBranchPkg = await getPackageJsonFromBranch(targetDir, 'origin/master', packageJsonRelativePath);
      branchName = 'origin/master';
    }

    if (!mainBranchPkg) {
      console.log(`  ⚠️ Could not find package.json for this project on 'origin/main' or 'origin/master'.`);
    }

    const packagesToTrack = ['@angular/core', '@angular/cli', 'typescript', 'rxjs'];

    console.table(
      packagesToTrack.map(pkgName => {
        const localVer = project.dependencies[pkgName] || project.devDependencies[pkgName] || '-';
        const mainVer = mainBranchPkg ? (mainBranchPkg.dependencies?.[pkgName] || mainBranchPkg.devDependencies?.[pkgName] || '-') : '-';

        return {
          Package: pkgName,
          'Local Version': localVer,
          [`${branchName} Version`]: mainVer,
          Status: localVer === mainVer ? '✅ Sync' : (localVer === '-' && mainVer === '-' ? 'N/A' : '⚠️ Mismatch')
        };
      })
    );
    console.log('');
  }

  console.log("✅ Scan Complete.");
}

main().catch(console.error);
