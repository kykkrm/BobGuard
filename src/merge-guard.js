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
          currentConflict = {
            startLine: i + 1,
            currentBranch: [],
            incomingBranch: [],
            file: filePath
          };
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
      /let\s+(\w+)\s*=\s*\([^)]*\)\s*=>/,
      /var\s+(\w+)\s*=\s*function/,
      /var\s+(\w+)\s*=\s*\([^)]*\)\s*=>/,
      /async\s+function\s+(\w+)\s*\(/,
      /(\w+)\s*:\s*function/,
      /(\w+)\s*:\s*\([^)]*\)\s*=>/,
      /(\w+)\s*\([^)]*\)\s*{/
    ];

    for (const pattern of patterns) {
      const match = code.match(pattern);
      if (match) return match[1];
    }
    return null;
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
      if (keywords.some(keyword => lowerCode.includes(keyword))) {
        return suffix;
      }
    }
    return 'Alt';
  }

  updateFunctionReferences(code, oldName, newName) {
    const patterns = [
      new RegExp(`\\b${oldName}\\s*\\(`, 'g'),
      new RegExp(`\\b${oldName}\\s*\\.`, 'g'),
      new RegExp(`['"\`]${oldName}['"\`]`, 'g'),
      new RegExp(`\\b${oldName}\\b(?!\\s*[:=])`, 'g')
    ];

    let updatedCode = code;
    patterns.forEach(pattern => {
      updatedCode = updatedCode.replace(pattern, (match) => {
        return match.replace(oldName, newName);
      });
    });

    return updatedCode;
  }

  handleDuplicateFunctions(currentCode, incomingCode) {
    const currentFuncName = this.extractFunctionName(currentCode);
    const incomingFuncName = this.extractFunctionName(incomingCode);

    if (currentFuncName && incomingFuncName && currentFuncName === incomingFuncName) {
      console.log(chalk.yellow(`⚠ Duplicate function detected: ${currentFuncName}`));
      
      const suffix = this.generateSmartSuffix(incomingCode);
      const newIncomingName = `${incomingFuncName}${suffix}`;
      
      console.log(chalk.blue(`  → Renaming incoming function to: ${newIncomingName}`));
      
      let renamedIncoming = incomingCode;
      
      const patterns = [
        { regex: new RegExp(`(function\\s+)${incomingFuncName}(\\s*\\()`), replacement: `$1${newIncomingName}$2` },
        { regex: new RegExp(`(const\\s+)${incomingFuncName}(\\s*=\\s*function)`), replacement: `$1${newIncomingName}$2` },
        { regex: new RegExp(`(const\\s+)${incomingFuncName}(\\s*=\\s*\\([^)]*\\)\\s*=>)`), replacement: `$1${newIncomingName}$2` },
        { regex: new RegExp(`(let\\s+)${incomingFuncName}(\\s*=\\s*function)`), replacement: `$1${newIncomingName}$2` },
        { regex: new RegExp(`(let\\s+)${incomingFuncName}(\\s*=\\s*\\([^)]*\\)\\s*=>)`), replacement: `$1${newIncomingName}$2` },
        { regex: new RegExp(`(var\\s+)${incomingFuncName}(\\s*=\\s*function)`), replacement: `$1${newIncomingName}$2` },
        { regex: new RegExp(`(var\\s+)${incomingFuncName}(\\s*=\\s*\\([^)]*\\)\\s*=>)`), replacement: `$1${newIncomingName}$2` },
        { regex: new RegExp(`(async\\s+function\\s+)${incomingFuncName}(\\s*\\()`), replacement: `$1${newIncomingName}$2` },
      ];
      
      for (const { regex, replacement } of patterns) {
        if (regex.test(renamedIncoming)) {
          renamedIncoming = renamedIncoming.replace(regex, replacement);
          break;
        }
      }
      
      return {
        isDuplicate: true,
        currentCode,
        incomingCode: renamedIncoming,
        originalName: incomingFuncName,
        newName: newIncomingName
      };
    }

    return { isDuplicate: false, currentCode, incomingCode };
  }

  async intelligentMerge(filePath) {
    const fileData = await this.parseConflictFile(filePath);
    if (!fileData) return false;

    const { lines, conflicts: parsedConflicts } = fileData;
    let mergedLines = [...lines];
    let modified = false;
    const renamedFunctions = [];

    console.log(chalk.blue(`\n🔍 Analyzing conflicts in ${filePath}...\n`));

    for (const conflict of parsedConflicts) {
      const currentCode = conflict.currentBranch.join('\n');
      const incomingCode = conflict.incomingBranch.join('\n');

      console.log(chalk.yellow(`Conflict at lines ${conflict.startLine}-${conflict.endLine}:`));
      console.log('DEBUG currentCode:', JSON.stringify(currentCode));
      console.log('DEBUG incomingCode:', JSON.stringify(incomingCode));

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
        console.log(chalk.green(`✓ Resolution: Keeping both with smart renaming\n`));
        const merged = `${duplicateResult.currentCode}\n\n${duplicateResult.incomingCode}`;
        mergedLines = this.replaceConflict(mergedLines, conflict, merged);
        renamedFunctions.push({
          oldName: duplicateResult.originalName,
          newName: duplicateResult.newName
        });
        modified = true;
        continue;
      }

      // Fallback: look for function name in context
      console.log(chalk.yellow('⚠ Keeping both versions\n'));

      // Check if currentCode already has complete function declaration
      const hasDeclaration = this.extractFunctionName(currentCode) !== null;

      let merged;
      if (hasDeclaration) {
        // Already complete functions, just rename incoming
        const suffix = this.generateSmartSuffix(incomingCode);
        const funcName = this.extractFunctionName(currentCode);
        let renamedIncoming = incomingCode.replace(
          new RegExp(`function\\s+${funcName}\\s*\\(`),
          `function ${funcName}${suffix}(`
        );
        merged = `${currentCode}\n\n${renamedIncoming}`;
      } else {
          // Look for function name in lines before conflict
          const ctxStart = Math.max(0, conflict.startLine - 3);
          const ctxLines = lines.slice(ctxStart, conflict.startLine - 1);
          const ctxCode = ctxLines.join('\n');
          const ctxFuncName = this.extractFunctionName(ctxCode);
          const ctxSuffix = this.generateSmartSuffix(incomingCode);

          if (ctxFuncName) {
            // Close current function, create new renamed function
            merged = `${currentCode}\n}\n\nfunction ${ctxFuncName}${ctxSuffix}() {\n${incomingCode}`;
          } else {
            merged = `${currentCode}\n\n${incomingCode}`;
          }
        }

      mergedLines = this.replaceConflict(mergedLines, conflict, merged);
      modified = true;
    }

    if (modified) {
      let finalContent = mergedLines.join('\n');
      
      if (renamedFunctions.length > 0) {
        console.log(chalk.blue('🔄 Updating function references...\n'));
        for (const { oldName, newName } of renamedFunctions) {
          finalContent = this.updateFunctionReferences(finalContent, oldName, newName);
          console.log(chalk.green(`  ✓ Updated: ${oldName} → ${newName}`));
        }
        console.log();
      }
      
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
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

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
    if (!currentBranch) {
      console.log(chalk.red('✗ Could not determine current branch\n'));
      return false;
    }

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
      if (!proceed) {
        console.log(chalk.yellow('\n✗ Merge cancelled\n'));
        return false;
      }
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

      if (conflictedFiles.length === 0) {
        console.log(chalk.red('✗ Merge failed:'), error.message);
        return false;
      }

      console.log(chalk.yellow(`Found ${conflictedFiles.length} conflicted file(s):\n`));
      conflictedFiles.forEach(f => console.log(chalk.gray(`  - ${f}`)));

      if (options.auto) {
        console.log(chalk.blue('\n🤖 Auto-resolve mode\n'));
        
        for (const file of conflictedFiles) {
          await this.intelligentMerge(file);
        }

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
  
  if (args.length === 0) {
    console.log(chalk.yellow('\nUsage: node merge-guard.js <branch> [--auto]\n'));
    process.exit(1);
  }

  const sourceBranch = args[0];
  const options = { auto: args.includes('--auto') || args.includes('-a') };

  const guard = new MergeGuard();
  const success = await guard.merge(sourceBranch, options);
  process.exit(success ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

export default MergeGuard;
