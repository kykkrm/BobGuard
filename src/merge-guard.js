#!/usr/bin/env node

import { simpleGit } from 'simple-git';
import chalk from 'chalk';
import { readFile, writeFile } from 'fs/promises';
import { createInterface } from 'readline';

const git = simpleGit();

class MergeGuard {
  constructor() {
    this.conflicts = [];
    this.mergedFiles = [];
  }

  async getCurrentBranch() {
    try {
      const status = await git.status();
      return status.current;
    } catch (error) {
      console.error(chalk.red('Error getting current branch:'), error.message);
      return null;
    }
  }

  async getBranches() {
    try {
      const branches = await git.branch();
      return branches.all;
    } catch (error) {
      console.error(chalk.red('Error getting branches:'), error.message);
      return [];
    }
  }

  async parseConflictFile(filePath) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const conflicts = [];
      let inConflict = false;
      let currentConflict = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('<<<<<<<')) {
          inConflict = true;
          currentConflict = { startLine: i + 1, currentBranch: [], incomingBranch: [], file: filePath };
        } else if (line.startsWith('=======') && inConflict) {
          currentConflict.separator = i + 1;
        } else if (line.startsWith('>>>>>>>') && inConflict) {
          currentConflict.endLine = i + 1;
          conflicts.push(currentConflict);
          inConflict = false;
          currentConflict = null;
        } else if (inConflict) {
          if (!currentConflict.separator) {
            currentConflict.currentBranch.push(line);
          } else {
            currentConflict.incomingBranch.push(line);
          }
        }
      }
      return { content, lines, conflicts };
    } catch (error) {
      console.error(chalk.red(`Error reading ${filePath}:`), error.message);
      return null;
    }
  }

  extractFunctionName(code) {
    const patterns = [
      /function\s+(\w+)\s*\(/,
      /const\s+(\w+)\s*=\s*function/,
      /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>/,
      /let\s+(\w+)\s*=\s*function/,
      /var\s+(\w+)\s*=\s*function/,
      /async\s+function\s+(\w+)\s*\(/,
    ];
    for (const pattern of patterns) {
      const match = code.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  extractAllFunctionNames(code) {
    const patterns = [
      /function\s+(\w+)\s*\(/g,
      /const\s+(\w+)\s*=\s*function/g,
      /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g,
      /let\s+(\w+)\s*=\s*function/g,
      /async\s+function\s+(\w+)\s*\(/g,
    ];
    const names = new Set();
    for (const pattern of patterns) {
      const matches = [...code.matchAll(pattern)];
      matches.forEach(m => names.add(m[1]));
    }
    return [...names];
  }

  generateSmartSuffix(code) {
    const lowerCode = code.toLowerCase();
    const suffixes = [
      { keywords: ['api', 'fetch', 'request', 'http'], suffix: 'FromAPI' },
      { keywords: ['database', 'db', 'query', 'select'], suffix: 'FromDB' },
      { keywords: ['cache', 'redis', 'memcache'], suffix: 'FromCache' },
      { keywords: ['file', 'fs', 'read', 'write'], suffix: 'FromFile' },
      { keywords: ['local', 'storage', 'localstorage'], suffix: 'FromLocal' },
      { keywords: ['session', 'sessionstorage'], suffix: 'FromSession' },
      { keywords: ['validate', 'check', 'verify'], suffix: 'Validated' },
      { keywords: ['format', 'transform', 'convert'], suffix: 'Formatted' },
      { keywords: ['filter', 'search', 'find'], suffix: 'Filtered' },
      { keywords: ['sort', 'order'], suffix: 'Sorted' },
      { keywords: ['async', 'await', 'promise'], suffix: 'Async' },
      { keywords: ['sync', 'synchronous'], suffix: 'Sync' },
      { keywords: ['new', 'create', 'init'], suffix: 'New' },
      { keywords: ['old', 'legacy', 'deprecated'], suffix: 'Legacy' },
      { keywords: ['v2', 'version2', 'updated'], suffix: 'V2' }
    ];
    for (const { keywords, suffix } of suffixes) {
      if (keywords.some(keyword => lowerCode.includes(keyword))) return suffix;
    }
    return 'Alt';
  }

  updateFunctionReferences(code, oldName, newName) {
    const patterns = [
      new RegExp(`\\b${oldName}\\s*\\(`, 'g'),
      new RegExp(`\\b${oldName}\\s*\\.`, 'g'),
      new RegExp(`['"\`]${oldName}['"\`]`, 'g'),
    ];
    let updatedCode = code;
    patterns.forEach(pattern => {
      updatedCode = updatedCode.replace(pattern, (match) => match.replace(oldName, newName));
    });
    return updatedCode;
  }

  renameFunctionInCode(code, oldName, newName) {
    const patterns = [
      new RegExp(`(function\\s+)${oldName}(\\s*\\()`, 'g'),
      new RegExp(`(const\\s+)${oldName}(\\s*=\\s*function)`, 'g'),
      new RegExp(`(const\\s+)${oldName}(\\s*=\\s*\\([^)]*\\)\\s*=>)`, 'g'),
      new RegExp(`(let\\s+)${oldName}(\\s*=\\s*function)`, 'g'),
      new RegExp(`(async\\s+function\\s+)${oldName}(\\s*\\()`, 'g'),
    ];
    let result = code;
    for (const pattern of patterns) {
      result = result.replace(pattern, `$1${newName}$2`);
    }
    return result;
  }

  handleDuplicateFunctions(currentCode, incomingCode) {
    const currentNames = this.extractAllFunctionNames(currentCode);
    const incomingNames = this.extractAllFunctionNames(incomingCode);
    const duplicates = currentNames.filter(name => incomingNames.includes(name));

    if (duplicates.length === 0) {
      return { isDuplicate: false, currentCode, incomingCode };
    }

    console.log(chalk.yellow(`⚠ Duplicate function(s) detected: ${duplicates.join(', ')}`));

    // Exact same content → keep one
    if (currentCode.trim() === incomingCode.trim()) {
      return { isDuplicate: true, merged: currentCode, renamedFunctions: [] };
    }

    let renamedIncoming = incomingCode;

    for (const funcName of duplicates) {
      // Get context of this function in incoming for smart suffix
      const funcRegex = new RegExp(`function\\s+${funcName}[^}]*}`, 's');
      const funcMatch = incomingCode.match(funcRegex);
      const funcContext = funcMatch ? funcMatch[0] : incomingCode;

      const suffix = this.generateSmartSuffix(funcContext);
      const newName = `${funcName}${suffix}`;

      console.log(chalk.blue(`  → Renaming incoming '${funcName}' to '${newName}'`));
      renamedIncoming = this.renameFunctionInCode(renamedIncoming, funcName, newName);
    }

    // currentCode stays unchanged, only incoming is renamed
    const merged = `${currentCode}\n\n${renamedIncoming}`;
    return { isDuplicate: true, merged, renamedFunctions: [] };
  }

  async intelligentMerge(filePath) {
    const fileData = await this.parseConflictFile(filePath);
    if (!fileData) return false;

    const { lines, conflicts: parsedConflicts } = fileData;
    let mergedLines = [...lines];
    let modified = false;

    console.log(chalk.blue(`\n🔍 Analyzing conflicts in ${filePath}...\n`));

    for (const conflict of parsedConflicts) {
      const currentCode = conflict.currentBranch.join('\n');
      const incomingCode = conflict.incomingBranch.join('\n');

      console.log(chalk.yellow(`Conflict at lines ${conflict.startLine}-${conflict.endLine}:`));

      if (currentCode.trim() === '' && incomingCode.trim() !== '') {
        console.log(chalk.green('✓ Resolution: Taking incoming changes\n'));
        mergedLines = this.replaceConflict(mergedLines, conflict, incomingCode);
        modified = true;
        continue;
      }

      if (incomingCode.trim() === '' && currentCode.trim() !== '') {
        console.log(chalk.green('✓ Resolution: Keeping current changes\n'));
        mergedLines = this.replaceConflict(mergedLines, conflict, currentCode);
        modified = true;
        continue;
      }

      if (currentCode.trim() === incomingCode.trim()) {
        console.log(chalk.green('✓ Resolution: Both sides identical\n'));
        mergedLines = this.replaceConflict(mergedLines, conflict, currentCode);
        modified = true;
        continue;
      }

      const duplicateResult = this.handleDuplicateFunctions(currentCode, incomingCode);

      if (duplicateResult.isDuplicate) {
        console.log(chalk.green(`✓ Resolution: Smart merge with renaming\n`));
        mergedLines = this.replaceConflict(mergedLines, conflict, duplicateResult.merged);
        modified = true;
        continue;
      }

      // Fallback
      console.log(chalk.yellow('⚠ Keeping both versions\n'));
      const hasDeclaration = this.extractFunctionName(currentCode) !== null;
      let merged;

      if (hasDeclaration) {
        const suffix = this.generateSmartSuffix(incomingCode);
        const funcName = this.extractFunctionName(currentCode);
        let renamedIncoming = this.renameFunctionInCode(incomingCode, funcName, `${funcName}${suffix}`);
        const currentHasClosingBrace = currentCode.trim().endsWith('}');
        merged = currentHasClosingBrace
          ? `${currentCode}\n\n${renamedIncoming}`
          : `${currentCode}\n}\n\n${renamedIncoming}`;
      } else {
        const ctxStart = Math.max(0, conflict.startLine - 3);
        const ctxLines = lines.slice(ctxStart, conflict.startLine - 1);
        const ctxFuncName = this.extractFunctionName(ctxLines.join('\n'));
        const ctxSuffix = this.generateSmartSuffix(incomingCode);
        const lineAfterConflict = lines[conflict.endLine] || '';
        const hasClosingBraceAfter = lineAfterConflict.trim() === '}';

        if (ctxFuncName) {
          merged = hasClosingBraceAfter
            ? `${currentCode}\n}\n\nfunction ${ctxFuncName}${ctxSuffix}() {\n${incomingCode}`
            : `${currentCode}\n}\n\nfunction ${ctxFuncName}${ctxSuffix}() {\n${incomingCode}\n}`;
        } else {
          merged = `${currentCode}\n\n${incomingCode}`;
        }
      }

      mergedLines = this.replaceConflict(mergedLines, conflict, merged);
      modified = true;
    }

    if (modified) {
      const finalContent = mergedLines.join('\n');
      await writeFile(filePath, finalContent, 'utf-8');
      await git.add(filePath);
      console.log(chalk.green(`✓ Merged ${filePath} successfully\n`));
      return true;
    }
    return false;
  }

  replaceConflict(lines, conflict, resolution) {
    const newLines = [...lines];
    const conflictLines = conflict.endLine - conflict.startLine + 1;
    const resolutionLines = resolution.split('\n');
    newLines.splice(conflict.startLine - 1, conflictLines, ...resolutionLines);
    return newLines;
  }

  async askConfirmation(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question(chalk.yellow(question), (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  async merge(sourceBranch, options = {}) {
    console.log(chalk.blue.bold('\n🛡️ BobGuard Intelligent Merge\n'));
    const currentBranch = await this.getCurrentBranch();
    if (!currentBranch) { console.log(chalk.red('✗ Could not determine current branch\n')); return false; }

    console.log(chalk.gray(`Current: ${currentBranch}`));
    console.log(chalk.gray(`Merging: ${sourceBranch}\n`));

    const branches = await this.getBranches();
    if (!branches.includes(sourceBranch)) {
      console.log(chalk.red(`✗ Branch '${sourceBranch}' does not exist\n`));
      return false;
    }

    const status = await git.status();
    if (status.files.length > 0 && !options.auto) {
      console.log(chalk.yellow('⚠ Uncommitted changes detected'));
      const proceed = await this.askConfirmation('\nContinue? (y/n): ');
      if (!proceed) { console.log(chalk.yellow('\n✗ Merge cancelled\n')); return false; }
    }

    try {
      console.log(chalk.blue('🔄 Attempting merge...\n'));
      await git.merge([sourceBranch]);
      console.log(chalk.green.bold('✓ Merge completed!\n'));
      return true;
    } catch (error) {
      console.log(chalk.yellow('⚠ Merge conflicts detected\n'));
      const conflictStatus = await git.status();
      const conflictedFiles = conflictStatus.conflicted || [];

      if (conflictedFiles.length === 0) { console.log(chalk.red('✗ Merge failed:'), error.message); return false; }

      console.log(chalk.yellow(`Found ${conflictedFiles.length} conflicted file(s):\n`));
      conflictedFiles.forEach(f => console.log(chalk.gray(`  - ${f}`)));

      if (options.auto) {
        console.log(chalk.blue('\n🤖 Auto-resolve mode\n'));
        for (const file of conflictedFiles) { await this.intelligentMerge(file); }

        const finalStatus = await git.status();
        if (finalStatus.conflicted.length === 0) {
          console.log(chalk.green.bold('✓ All conflicts resolved!\n'));
          await git.commit(`Merge branch '${sourceBranch}' into ${currentBranch}`);
          console.log(chalk.green('✓ Merge committed\n'));
          return true;
        } else {
          console.log(chalk.yellow(`⚠ ${finalStatus.conflicted.length} conflict(s) need manual resolution\n`));
          return false;
        }
      } else {
        console.log(chalk.gray('\nOptions:'));
        console.log(chalk.gray('  --auto    Auto-resolve conflicts\n'));
        return false;
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) { console.log(chalk.yellow('\nUsage: node merge-guard.js <branch> [--auto]\n')); process.exit(1); }
  const sourceBranch = args[0];
  const options = { auto: args.includes('--auto') || args.includes('-a') };
  const guard = new MergeGuard();
  const success = await guard.merge(sourceBranch, options);
  process.exit(success ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error(chalk.red('Fatal error:'), error); process.exit(1); });
}

export default MergeGuard;
