#!/usr/bin/env node

import { simpleGit } from 'simple-git';
import chalk from 'chalk';
import { createInterface } from 'readline';
import dotenv from 'dotenv';

dotenv.config();
console.log('API Key:', process.env.WATSONX_API_KEY ? 'loaded' : 'missing');
console.log('Project ID:', process.env.WATSONX_PROJECT_ID ? 'loaded' : 'missing');

const git = simpleGit();

class CommitMessageGenerator {
  constructor() {
    this.apiKey = process.env.WATSONX_API_KEY;
    this.projectId = process.env.WATSONX_PROJECT_ID;
    this.apiUrl = 'https://us-south.ml.cloud.ibm.com/ml/v1/text/generation?version=2023-05-29';
  }

  async getIAMToken() {
    try {
      const response = await fetch('https://iam.cloud.ibm.com/identity/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${this.apiKey}`
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`IAM token request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log(chalk.green('IAM token received'));
      return data.access_token;
    } catch (error) {
      console.error(chalk.red('Error getting IAM token:'), error.message);
      return null;
    }
  }

  groupFilesByType(files) {
    const groups = {
      code: [],
      docs: [],
      assets: [],
      sessions: [],
      config: []
    };

    for (const file of files) {
      if (file.startsWith('bob_sessions/')) {
        groups.sessions.push(file);
      } else if (file.endsWith('.js')) {
        groups.code.push(file);
      } else if (file.endsWith('.md')) {
        groups.docs.push(file);
      } else if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.gif')) {
        groups.assets.push(file);
      } else if (file.endsWith('.json') || file === '.gitignore') {
        groups.config.push(file);
      } else {
        groups.code.push(file); // Default to code
      }
    }

    return groups;
  }

  async callWatsonxAPI(stagedFiles) {
    try {
      const token = await this.getIAMToken();
      if (!token) {
        return null;
      }

      // Group files if more than 3
      const useGrouping = stagedFiles.length > 3;
      let prompt;

      if (useGrouping) {
        const groups = this.groupFilesByType(stagedFiles);
        const groupSummaries = [];

        for (const [groupName, files] of Object.entries(groups)) {
          if (files.length > 0) {
            groupSummaries.push(`${groupName}: ${files.join(', ')}`);
          }
        }

        prompt = `Analyze these file changes and write a commit message.
BE SPECIFIC about what each file actually does.
DO NOT use metaphors, analogies, or generic phrases.
DO NOT say things like 'a good commit message is like...'

For each file, describe the ACTUAL functionality:
- What does this code do technically?
- What was added or changed?

File groups:
${groupSummaries.join('\n')}

Format:
feat(core): update code, docs, and session exports

Code changes:
- filename: description
- filename: description

Documentation:
- filename: description

Write ONLY the commit message, nothing else:`;
      } else {
        // Get diff for each file and extract added lines
        const fileChanges = [];
        for (const file of stagedFiles) {
          try {
            const fileDiff = await git.diff(['--cached', '--', file]);
            if (fileDiff) {
              // Extract only lines starting with "+" (added/changed lines)
              const addedLines = fileDiff
                .split('\n')
                .filter(line => line.startsWith('+') && !line.startsWith('+++'))
                .map(line => line.substring(1)) // Remove the "+" prefix
                .join('\n')
                .substring(0, 300); // Limit to 300 chars per file

              if (addedLines) {
                fileChanges.push(`${file}:\n${addedLines}`);
              }
            }
          } catch (error) {
            console.error(chalk.yellow(`Warning: Could not get diff for ${file}`));
          }
        }

        const filesSummary = fileChanges.join('\n\n');

        prompt = `Analyze the code changes below and write a git commit message.
DO NOT copy any code or diff content into the message.
ONLY write a human-readable summary.

Format:
feat(scope): one line summary

- filename: one sentence explaining what this file does

Changes to analyze:
${filesSummary}

Write ONLY the commit message:`;
      }

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          input: prompt,
          parameters: {
            decoding_method: 'greedy',
            max_new_tokens: 800,
            min_new_tokens: 10,
            temperature: 0.7,
            top_k: 50,
            top_p: 1,
            stop_sequences: []
          },
          // model_id: 'meta-llama/llama-3-3-70b-instruct',
          model_id: 'ibm/granite-8b-code-instruct', 
          project_id: this.projectId
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(chalk.red('API Error:'), response.status, errorText);
        return null;
      }

      const data = await response.json();
      console.log(chalk.green('API response received'));
      
      if (data.results && data.results[0] && data.results[0].generated_text) {
        // Get the generated text and clean it up
        let generatedText = data.results[0].generated_text.trim();
        
        // Remove everything after "### Commit message" or similar markers
        if (generatedText.includes('### Commit message')) {
          generatedText = generatedText.split('### Commit message')[0].trim();
        }
        if (generatedText.includes('###')) {
          generatedText = generatedText.split('###')[0].trim();
        }
        
        // Remove meta-instructions after first empty line
        const lines = generatedText.split('\n');
        const cleanedLines = [];
        let foundEmptyLine = false;
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          
          // Track if we've seen an empty line
          if (!trimmedLine) {
            foundEmptyLine = true;
            cleanedLines.push(line);
            continue;
          }
          
          // After empty line, check for meta-instructions
          if (foundEmptyLine) {
            const lowerLine = trimmedLine.toLowerCase();
            if (lowerLine.includes('the commit message should') ||
                lowerLine.includes("here's the final") ||
                lowerLine.includes('here is the final') ||
                lowerLine.includes('note:') ||
                lowerLine.includes('explanation:') ||
                lowerLine.includes('this commit message')) {
              // Stop processing - this is meta-instruction
              break;
            }
          }
          
          cleanedLines.push(line);
        }
        
        // Remove any duplicate sections (sometimes AI repeats the entire message)
        const uniqueLines = [];
        const seenLines = new Set();
        
        for (const line of cleanedLines) {
          const normalized = line.trim().toLowerCase();
          if (normalized && !seenLines.has(normalized)) {
            seenLines.add(normalized);
            uniqueLines.push(line.trim());
          }
        }
        
        return uniqueLines.join('\n');
      }
      
      return null;
    } catch (error) {
      console.error(chalk.red('Error calling watsonx.ai API:'), error.message);
      return null;
    }
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

  async getDiffSummary() {
    try {
      const diffSummary = await git.diffSummary(['--cached']);
      const fileStats = [];
      
      for (const file of diffSummary.files) {
        fileStats.push({
          file: file.file,
          insertions: file.insertions,
          deletions: file.deletions,
          changes: file.changes
        });
      }
      
      return fileStats;
    } catch (error) {
      console.error(chalk.red('Error getting diff summary:'), error.message);
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

  async generateMessage(diff, stagedFiles) {
    // Check if credentials exist and try watsonx.ai API first
    if (this.apiKey && this.projectId && stagedFiles && stagedFiles.length > 0) {
      console.log(chalk.blue('Credentials found, calling watsonx.ai...'));
      
      // Pass staged files list to AI
      const aiMessage = await this.callWatsonxAPI(stagedFiles);
      if (aiMessage) {
        return aiMessage;
      }
      
      console.log(chalk.yellow('Falling back to basic generation'));
    }

    // Fallback to basic file-based message generation
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
    const message = await this.generateMessage(diff, status.staged);

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

