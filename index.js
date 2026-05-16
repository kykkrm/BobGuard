#!/usr/bin/env node

import chalk from 'chalk';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import SecretScanner from './secret-scanner.js';
import CommitMessageGenerator from './commit-message.js';
import MergeGuard from './merge-guard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class BobGuard {
  constructor() {
    this.envPath = join(__dirname, '.env');
    this.envExamplePath = join(__dirname, '.env.example');
  }

  checkEnvFile() {
    if (!existsSync(this.envPath)) {
      console.log(chalk.red('\n✗ Missing .env file!\n'));
      console.log(chalk.yellow('BobGuard requires a .env file for configuration.\n'));
      
      if (existsSync(this.envExamplePath)) {
        console.log(chalk.gray('Steps to set up:'));
        console.log(chalk.gray('  1. Copy .env.example to .env'));
        console.log(chalk.gray('  2. Edit .env and add your credentials'));
        console.log(chalk.gray('\nExample:'));
        console.log(chalk.cyan('  cp .env.example .env'));
        console.log(chalk.cyan('  nano .env\n'));
      } else {
        console.log(chalk.gray('Create a .env file with:'));
        console.log(chalk.gray('  WATSONX_API_KEY=your_api_key'));
        console.log(chalk.gray('  WATSONX_PROJECT_ID=your_project_id\n'));
      }
      
      return false;
    }
    
    // Load environment variables
    dotenv.config({ path: this.envPath });
    return true;
  }

  showBanner() {
    console.log(chalk.blue.bold('\n╔═══════════════════════════════════════╗'));
    console.log(chalk.blue.bold('║         🛡️ BobGuard v1.0.0          ║'));
    console.log(chalk.blue.bold('║   AI-Powered Git Security & Tools    ║'));
    console.log(chalk.blue.bold('╚═══════════════════════════════════════╝\n'));
  }

  showHelp() {
    this.showBanner();
    
    console.log(chalk.cyan.bold('USAGE:\n'));
    console.log(chalk.gray('  node index.js [command] [options]\n'));
    
    console.log(chalk.cyan.bold('COMMANDS:\n'));
    
    console.log(chalk.yellow('  scan') + chalk.gray('              Scan staged files for secrets'));
    console.log(chalk.gray('    --auto-remove    Automatically remove detected secrets\n'));
    
    console.log(chalk.yellow('  commit') + chalk.gray('            Generate AI commit message'));
    console.log(chalk.gray('    --auto-commit    Commit automatically without confirmation\n'));
    
    console.log(chalk.yellow('  merge <branch>') + chalk.gray('    Intelligently merge branches'));
    console.log(chalk.gray('    --auto           Auto-resolve conflicts when possible\n'));
    
    console.log(chalk.yellow('  guard') + chalk.gray('             Run full workflow (scan → commit)'));
    console.log(chalk.gray('    --auto-remove    Auto-remove secrets'));
    console.log(chalk.gray('    --auto-commit    Auto-commit after generation\n'));
    
    console.log(chalk.yellow('  help') + chalk.gray('              Show this help message\n'));
    
    console.log(chalk.cyan.bold('EXAMPLES:\n'));
    console.log(chalk.gray('  # Scan for secrets'));
    console.log(chalk.cyan('  node index.js scan\n'));
    
    console.log(chalk.gray('  # Scan and auto-remove secrets'));
    console.log(chalk.cyan('  node index.js scan --auto-remove\n'));
    
    console.log(chalk.gray('  # Generate commit message'));
    console.log(chalk.cyan('  node index.js commit\n'));
    
    console.log(chalk.gray('  # Full workflow: scan then commit'));
    console.log(chalk.cyan('  node index.js guard\n'));
    
    console.log(chalk.gray('  # Merge with auto-resolve'));
    console.log(chalk.cyan('  node index.js merge feature-branch --auto\n'));
    
    console.log(chalk.cyan.bold('CONFIGURATION:\n'));
    console.log(chalk.gray('  Create a .env file with your credentials:'));
    console.log(chalk.gray('    WATSONX_[REDACTED_GENERIC_API_KEY]));
    console.log(chalk.gray('    WATSONX_PROJECT_ID=your_watsonx_project_id\n'));
    
    console.log(chalk.cyan.bold('FEATURES:\n'));
    console.log(chalk.green('  ✓') + chalk.gray(' Secret detection with 19+ patterns'));
    console.log(chalk.green('  ✓') + chalk.gray(' Auto-remove secrets with placeholders'));
    console.log(chalk.green('  ✓') + chalk.gray(' AI-powered commit messages'));
    console.log(chalk.green('  ✓') + chalk.gray(' Smart function renaming in merges'));
    console.log(chalk.green('  ✓') + chalk.gray(' Automatic conflict resolution'));
    console.log(chalk.green('  ✓') + chalk.gray(' No hardcoded credentials\n'));
  }

  async runScan(options = {}) {
    console.log(chalk.blue.bold('\n🔍 Running Secret Scanner...\n'));
    
    const scanner = new SecretScanner(options.autoRemove);
    const isClean = await scanner.scan();
    
    return isClean;
  }

  async runCommit(options = {}) {
    console.log(chalk.blue.bold('\n📝 Running Commit Message Generator...\n'));
    
    if (!this.checkEnvFile()) {
      return false;
    }
    
    const generator = new CommitMessageGenerator();
    const result = await generator.generate(options);
    
    return result !== null;
  }

  async runMerge(branch, options = {}) {
    console.log(chalk.blue.bold('\n🛡️ Running Merge Guard...\n'));
    
    if (!branch) {
      console.log(chalk.red('✗ Please specify a branch to merge\n'));
      console.log(chalk.gray('Usage: node index.js merge <branch> [--auto]\n'));
      return false;
    }
    
    const guard = new MergeGuard();
    const success = await guard.merge(branch, options);
    
    return success;
  }

  async runGuard(options = {}) {
    this.showBanner();
    
    console.log(chalk.blue.bold('🛡️ Running Full BobGuard Workflow\n'));
    console.log(chalk.gray('Step 1: Secret Scanning'));
    console.log(chalk.gray('Step 2: Commit Message Generation\n'));
    
    // Step 1: Scan for secrets
    const scanOptions = {
      autoRemove: options.autoRemove
    };
    
    const isClean = await this.runScan(scanOptions);
    
    if (!isClean) {
      console.log(chalk.red('\n✗ Workflow stopped: Secrets detected\n'));
      console.log(chalk.yellow('Please remove secrets or use --auto-remove flag\n'));
      return false;
    }
    
    console.log(chalk.green('✓ Secret scan passed!\n'));
    
    // Step 2: Generate commit message
    const commitOptions = {
      autoCommit: options.autoCommit
    };
    
    const committed = await this.runCommit(commitOptions);
    
    if (committed) {
      console.log(chalk.green.bold('\n✓ BobGuard workflow completed successfully!\n'));
      return true;
    } else {
      console.log(chalk.yellow('\n⚠ Workflow completed with warnings\n'));
      return false;
    }
  }

  async run(args) {
    const command = args[0] || 'help';
    const options = {
      autoRemove: args.includes('--auto-remove') || args.includes('-r'),
      autoCommit: args.includes('--auto-commit') || args.includes('-c'),
      auto: args.includes('--auto') || args.includes('-a')
    };

    switch (command) {
      case 'scan':
        return await this.runScan(options);
      
      case 'commit':
        return await this.runCommit(options);
      
      case 'merge':
        const branch = args[1];
        return await this.runMerge(branch, options);
      
      case 'guard':
        return await this.runGuard(options);
      
      case 'help':
      case '--help':
      case '-h':
        this.showHelp();
        return true;
      
      default:
        console.log(chalk.red(`\n✗ Unknown command: ${command}\n`));
        console.log(chalk.gray('Run "node index.js help" for usage information\n'));
        return false;
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  const bobGuard = new BobGuard();
  const success = await bobGuard.run(args);
  
  process.exit(success ? 0 : 1);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('\nFatal error:'), error.message);
    console.error(chalk.gray('\nStack trace:'), error.stack);
    process.exit(1);
  });
}

export default BobGuard;

// Made with Bob
