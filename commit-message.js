#!/usr/bin/env node

import { simpleGit } from 'simple-git';
import chalk from 'chalk';
import { createInterface } from 'readline';
import dotenv from 'dotenv';

dotenv.config();

const git = simpleGit();

class CommitMessageGenerator {
  constructor() {
    this.apiKey = process.env.WATSONX_API_KEY;
    this.projectId = process.env.WATSONX_PROJECT_ID;
  }

  async getDiff() {
    try {
      const diff = await git.diff(['--cached']);
      if (!diff) {
        console.log(chalk.yellow('No staged changes found\n'));
        console.log(chalk.gray('Stage files with: git add <files>\n'));
        return null;
      }
      return diff;
    } catch (error) {
      console.error(chalk.red('Error getting diff:'), error.message);
      return null;
    }
  }

  async getStatus() {
    try {
      const status = await git.status();
      return status;
    } catch (error) {
      console.error(chalk.red('Error getting status:'), error.message);
      return null;
    }
  }

  async generateMessage(diff) {
    const lines = diff.split('\n');
    const addedFiles = [];
    const modifiedFiles = [];
    const deletedFiles = [];
    
    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/b\/(.+)$/);
        if (match) {
          const file = match[1];
          if (line.includes('new file')) {
            addedFiles.push(file);
          } else if (line.includes('deleted file')) {
            deletedFiles.push(file);
          } else {
            modifiedFiles.push(file);
          }
        }
      }
    }

    let message = '';
    
    if (addedFiles.length > 0) {
      message += `Add ${addedFiles.join(', ')}`;
    }
    
    if (modifiedFiles.length > 0) {
      if (message) message += '\n';
      message += `Update ${modifiedFiles.join(', ')}`;
    }
    
    if (deletedFiles.length > 0) {
      if (message) message += '\n';
      message += `Remove ${deletedFiles.join(', ')}`;
    }

    if (!message) {
      message = 'Update files';
    }

    return message;
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

  async generate(options = {}) {
    console.log(chalk.blue.bold('Commit Message Generator\n'));

    if (!this.apiKey || !this.projectId) {
      console.log(chalk.yellow('WatsonX credentials not configured\n'));
      console.log(chalk.gray('Using basic commit message generation\n'));
    }

    const diff = await this.getDiff();
    if (!diff) {
      return null;
    }

    const status = await this.getStatus();
    if (!status) {
      return null;
    }

    console.log(chalk.blue('Staged changes:\n'));
    if (status.staged.length > 0) {
      status.staged.forEach(file => {
        console.log(chalk.green(`  + ${file}`));
      });
    }
    console.log();

    console.log(chalk.blue('Generating commit message...\n'));
    const message = await this.generateMessage(diff);

    console.log(chalk.cyan('Generated message:\n'));
    console.log(chalk.white(message));
    console.log();

    if (options.autoCommit) {
      console.log(chalk.blue('Auto-committing...\n'));
      try {
        await git.commit(message);
        console.log(chalk.green.bold('Changes committed successfully!\n'));
        return message;
      } catch (error) {
        console.error(chalk.red('Commit failed:'), error.message);
        return null;
      }
    } else {
      const proceed = await this.askConfirmation('Commit with this message? (y/n): ');
      
      if (proceed) {
        try {
          await git.commit(message);
          console.log(chalk.green.bold('\nChanges committed successfully!\n'));
          return message;
        } catch (error) {
          console.error(chalk.red('\nCommit failed:'), error.message);
          return null;
        }
      } else {
        console.log(chalk.yellow('\nCommit cancelled\n'));
        return null;
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options = {
    autoCommit: args.includes('--auto-commit') || args.includes('-c')
  };

  const generator = new CommitMessageGenerator();
  const result = await generator.generate(options);
  process.exit(result ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

export default CommitMessageGenerator;
