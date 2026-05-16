#!/usr/bin/env node

import { simpleGit } from 'simple-git';
import chalk from 'chalk';
import { readFile, writeFile } from 'fs/promises';
import { createInterface } from 'readline';

const git = simpleGit();

class SecretScanner {
  constructor(autoRemove = false) {
    this.autoRemove = autoRemove;
    this.whitelist = [
      'your_api_key',
      'your_ibm_cloud_api_key',
      'your_project_id',
      'your_token',
      'placeholder',
      'example',
      '<',
      '>'
    ];
    this.patterns = [
      { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
      { name: 'AWS Secret Key', regex: /aws_secret_access_key\s*=\s*['"]?([A-Za-z0-9/+=]{40})['"]?/ },
      { name: 'GitHub Token', regex: /ghp_[a-zA-Z0-9]{36}/ },
      { name: 'GitHub OAuth', regex: /gho_[a-zA-Z0-9]{36}/ },
      { name: 'Generic API Key', regex: /api[_-]?key\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?/i },
      { name: 'Generic Secret', regex: /secret\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?/i },
      { name: 'Private Key', regex: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/ },
      { name: 'JWT Token', regex: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/ },
      { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/ },
      { name: 'Google API Key', regex: /AIza[0-9A-Za-z_-]{35}/ },
      { name: 'Google OAuth', regex: /[0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com/ },
      { name: 'Heroku API Key', regex: /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/ },
      { name: 'MailChimp API Key', regex: /[0-9a-f]{32}-us[0-9]{1,2}/ },
      { name: 'Mailgun API Key', regex: /key-[0-9a-zA-Z]{32}/ },
      { name: 'PayPal Braintree', regex: /access_token\$production\$[0-9a-z]{16}\$[0-9a-f]{32}/ },
      { name: 'Picatic API Key', regex: /sk_live_[0-9a-z]{32}/ },
      { name: 'Stripe API Key', regex: /sk_live_[0-9a-zA-Z]{24}/ },
      { name: 'Square Access Token', regex: /sq0atp-[0-9A-Za-z_-]{22}/ },
      { name: 'Twilio API Key', regex: /SK[0-9a-fA-F]{32}/ },
      { name: 'Password in URL', regex: /[a-zA-Z]{3,10}:\/\/[^:\/\s]+:[^@\/\s]+@[^\/\s]+/ }
    ];
  }

  async getStagedFiles() {
    try {
      const status = await git.status();
      return status.staged;
    } catch (error) {
      console.error(chalk.red('Error getting staged files:'), error.message);
      return [];
    }
  }

  isWhitelisted(line) {
    return this.whitelist.some(pattern => line.includes(pattern));
  }

  async scanFile(filePath) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const findings = [];

      lines.forEach((line, index) => {
        // Skip whitelisted lines (placeholders/examples)
        if (this.isWhitelisted(line)) {
          return;
        }
        
        this.patterns.forEach(pattern => {
          if (pattern.regex.test(line)) {
            findings.push({
              file: filePath,
              line: index + 1,
              type: pattern.name,
              content: line.trim()
            });
          }
        });
      });

      return findings;
    } catch (error) {
      console.error(chalk.red(`Error scanning ${filePath}:`), error.message);
      return [];
    }
  }

  async removeSecrets(filePath, findings) {
    try {
      const content = await readFile(filePath, 'utf-8');
      let lines = content.split('\n');

      findings.forEach(finding => {
        const lineIndex = finding.line - 1;
        this.patterns.forEach(pattern => {
          if (pattern.regex.test(lines[lineIndex])) {
            lines[lineIndex] = lines[lineIndex].replace(
              pattern.regex,
              `[REDACTED_${pattern.name.toUpperCase().replace(/\s+/g, '_')}]`
            );
          }
        });
      });

      await writeFile(filePath, lines.join('\n'), 'utf-8');
      await git.add(filePath);
      return true;
    } catch (error) {
      console.error(chalk.red(`Error removing secrets from ${filePath}:`), error.message);
      return false;
    }
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

  async scan() {
    console.log(chalk.blue.bold('Secret Scanner\n'));

    const stagedFiles = await this.getStagedFiles();
    
    if (stagedFiles.length === 0) {
      console.log(chalk.yellow('No staged files to scan\n'));
      console.log(chalk.gray('Stage files with: git add <files>\n'));
      return true;
    }

    console.log(chalk.blue(`Scanning ${stagedFiles.length} staged file(s)...\n`));

    let allFindings = [];

    for (const file of stagedFiles) {
      const findings = await this.scanFile(file);
      if (findings.length > 0) {
        allFindings = allFindings.concat(findings);
      }
    }

    if (allFindings.length === 0) {
      console.log(chalk.green('No secrets detected!\n'));
      return true;
    }

    console.log(chalk.red(`Found ${allFindings.length} potential secret(s):\n`));

    const fileGroups = {};
    allFindings.forEach(finding => {
      if (!fileGroups[finding.file]) {
        fileGroups[finding.file] = [];
      }
      fileGroups[finding.file].push(finding);
    });

    Object.keys(fileGroups).forEach(file => {
      console.log(chalk.yellow(`${file}:`));
      fileGroups[file].forEach(finding => {
        console.log(chalk.gray(`  Line ${finding.line}: ${finding.type}`));
        console.log(chalk.red(`    ${finding.content.substring(0, 80)}${finding.content.length > 80 ? '...' : ''}`));
      });
      console.log();
    });

    if (this.autoRemove) {
      console.log(chalk.blue('Auto-removing secrets...\n'));
      
      for (const file of Object.keys(fileGroups)) {
        const removed = await this.removeSecrets(file, fileGroups[file]);
        if (removed) {
          console.log(chalk.green(`Removed secrets from ${file}`));
        }
      }
      console.log();
      return true;
    } else {
      const remove = await this.askConfirmation('Remove secrets automatically? (y/n): ');
      
      if (remove) {
        console.log();
        for (const file of Object.keys(fileGroups)) {
          const removed = await this.removeSecrets(file, fileGroups[file]);
          if (removed) {
            console.log(chalk.green(`Removed secrets from ${file}`));
          }
        }
        console.log();
        return true;
      } else {
        console.log(chalk.yellow('\nPlease remove secrets manually before committing\n'));
        return false;
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const autoRemove = args.includes('--auto-remove') || args.includes('-r');

  const scanner = new SecretScanner(autoRemove);
  const isClean = await scanner.scan();
  process.exit(isClean ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

export default SecretScanner;
