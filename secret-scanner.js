#!/usr/bin/env node

import { simpleGit } from 'simple-git';
import { readFile, writeFile } from 'fs/promises';
import chalk from 'chalk';

const git = simpleGit();

// Patterns for detecting secrets (without actual keys)
const SECRET_PATTERNS = [
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: 'high'
  },
  {
    name: 'AWS Secret Key',
    pattern: /aws_secret_access_key\s*=\s*['"][^'"]+['"]/gi,
    severity: 'high'
  },
  {
    name: 'Generic API Key',
    pattern: /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/gi,
    severity: 'high'
  },
  {
    name: 'Generic Secret',
    pattern: /secret\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/gi,
    severity: 'high'
  },
  {
    name: 'Private Key',
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    severity: 'critical'
  },
  {
    name: 'GitHub Token',
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g,
    severity: 'high'
  },
  {
    name: 'Slack Token',
    pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,}/g,
    severity: 'high'
  },
  {
    name: 'Google API Key',
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    severity: 'high'
  },
  {
    name: 'Password in Code',
    pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    severity: 'medium'
  },
  {
    name: 'Bearer Token',
    pattern: /bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi,
    severity: 'high'
  },
  {
    name: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    severity: 'medium'
  },
  {
    name: 'Database Connection String',
    pattern: /(mongodb|mysql|postgresql|postgres):\/\/[^\s'"]+/gi,
    severity: 'high'
  },
  {
    name: 'Stripe Secret Key',
    pattern: /sk_(live|test)_[a-zA-Z0-9]{24,}/g,
    severity: 'critical'
  },
  {
    name: 'Stripe Publishable Key',
    pattern: /pk_(live|test)_[a-zA-Z0-9]{24,}/g,
    severity: 'medium'
  },
  {
    name: 'Firebase API Key',
    pattern: /AIzaSy[a-zA-Z0-9_-]{33}/g,
    severity: 'high'
  },
  {
    name: 'Twilio Account SID',
    pattern: /AC[a-zA-Z0-9]{32}/g,
    severity: 'high'
  },
  {
    name: 'SendGrid API Key',
    pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g,
    severity: 'high'
  },
  {
    name: 'NPM Token',
    pattern: /npm_[a-zA-Z0-9]{36}/g,
    severity: 'high'
  },
  {
    name: 'Hardcoded IP with credentials',
    pattern: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:[0-9]+\/[^\s'"]+/g,
    severity: 'medium'
  }
];

// Files to ignore
const IGNORE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /package-lock\.json/,
  /yarn\.lock/,
  /\.min\.js$/,
  /\.map$/
];

const PLACEHOLDER = '***REMOVED_BY_BOBGUARD***';

class SecretScanner {
  constructor(autoRemove = false) {
    this.findings = [];
    this.autoRemove = autoRemove;
    this.removedSecrets = [];
  }

  shouldIgnoreFile(filePath) {
    return IGNORE_PATTERNS.some(pattern => pattern.test(filePath));
  }

  async scanFile(filePath, content) {
    const lines = content.split('\n');
    const fileFindings = [];

    SECRET_PATTERNS.forEach(({ name, pattern, severity }) => {
      lines.forEach((line, index) => {
        const matches = line.match(pattern);
        if (matches) {
          matches.forEach(match => {
            fileFindings.push({
              file: filePath,
              line: index + 1,
              type: name,
              severity,
              preview: this.maskSecret(line.trim()),
              match: match,
              originalLine: line
            });
          });
        }
      });
    });

    return fileFindings;
  }

  maskSecret(text) {
    // Mask the middle portion of secrets for security
    if (text.length <= 10) return '***';
    const start = text.substring(0, 5);
    const end = text.substring(text.length - 5);
    return `${start}...${end}`;
  }

  async removeSecretsFromFile(filePath, findings) {
    try {
      const content = await readFile(filePath, 'utf-8');
      let lines = content.split('\n');
      let modified = false;

      // Group findings by line number
      const findingsByLine = {};
      findings.forEach(finding => {
        if (!findingsByLine[finding.line]) {
          findingsByLine[finding.line] = [];
        }
        findingsByLine[finding.line].push(finding);
      });

      // Replace secrets line by line
      Object.keys(findingsByLine).forEach(lineNum => {
        const lineIndex = parseInt(lineNum) - 1;
        const lineFindings = findingsByLine[lineNum];
        let newLine = lines[lineIndex];

        lineFindings.forEach(finding => {
          // Replace the actual secret with placeholder
          newLine = newLine.replace(finding.match, PLACEHOLDER);
          modified = true;

          this.removedSecrets.push({
            file: filePath,
            line: lineNum,
            type: finding.type,
            severity: finding.severity
          });
        });

        lines[lineIndex] = newLine;
      });

      if (modified) {
        // Write the cleaned content back to file
        await writeFile(filePath, lines.join('\n'), 'utf-8');
        
        // Re-stage the cleaned file
        await git.add(filePath);
        
        return true;
      }

      return false;
    } catch (error) {
      console.error(chalk.red(`Error removing secrets from ${filePath}:`), error.message);
      return false;
    }
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

  async scan() {
    console.log(chalk.blue.bold('\n🔍 BobGuard Secret Scanner\n'));
    
    if (this.autoRemove) {
      console.log(chalk.yellow('⚡ Auto-remove mode enabled\n'));
    }
    
    const stagedFiles = await this.getStagedFiles();
    
    if (stagedFiles.length === 0) {
      console.log(chalk.yellow('No staged files to scan.'));
      console.log(chalk.gray('Use "git add <file>" to stage files for scanning.\n'));
      return true;
    }

    console.log(chalk.gray(`Scanning ${stagedFiles.length} staged file(s)...\n`));

    const fileFindings = {};

    for (const file of stagedFiles) {
      if (this.shouldIgnoreFile(file)) {
        console.log(chalk.gray(`⊘ Skipping: ${file}`));
        continue;
      }

      try {
        const content = await readFile(file, 'utf-8');
        const findings = await this.scanFile(file, content);
        
        if (findings.length > 0) {
          this.findings.push(...findings);
          fileFindings[file] = findings;
          console.log(chalk.red(`✗ ${file}: ${findings.length} potential secret(s) found`));
        } else {
          console.log(chalk.green(`✓ ${file}: Clean`));
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠ ${file}: Could not read (${error.message})`));
      }
    }

    // Auto-remove secrets if enabled
    if (this.autoRemove && this.findings.length > 0) {
      console.log(chalk.yellow.bold('\n🔧 Auto-removing detected secrets...\n'));
      
      for (const [file, findings] of Object.entries(fileFindings)) {
        const removed = await this.removeSecretsFromFile(file, findings);
        if (removed) {
          console.log(chalk.green(`✓ Cleaned: ${file}`));
        }
      }

      this.displayRemovedSecrets();
      return true; // Allow commit after auto-removal
    }

    this.displayResults();
    return this.findings.length === 0;
  }

  displayRemovedSecrets() {
    if (this.removedSecrets.length === 0) return;

    console.log(chalk.green.bold(`\n✓ Successfully removed ${this.removedSecrets.length} secret(s):\n`));

    this.removedSecrets.forEach(removed => {
      console.log(chalk.green(`  ${removed.file}:${removed.line}`));
      console.log(chalk.gray(`    Type: ${removed.type} (${removed.severity})`));
      console.log(chalk.gray(`    Replaced with: ${PLACEHOLDER}`));
      console.log();
    });

    console.log(chalk.green.bold('✓ Files cleaned and re-staged automatically!\n'));
    console.log(chalk.yellow('⚠ Important: Store your secrets in environment variables or .env files\n'));
  }

  displayResults() {
    if (this.findings.length === 0) {
      console.log(chalk.green.bold('\n✓ No secrets detected! Safe to commit.\n'));
      return;
    }

    console.log(chalk.red.bold(`\n⚠ Found ${this.findings.length} potential secret(s):\n`));

    // Group by severity
    const critical = this.findings.filter(f => f.severity === 'critical');
    const high = this.findings.filter(f => f.severity === 'high');
    const medium = this.findings.filter(f => f.severity === 'medium');

    const displayGroup = (findings, label, color) => {
      if (findings.length === 0) return;
      
      console.log(chalk[color].bold(`${label} (${findings.length}):`));
      findings.forEach(finding => {
        console.log(chalk[color](`  ${finding.file}:${finding.line}`));
        console.log(chalk.gray(`    Type: ${finding.type}`));
        console.log(chalk.gray(`    Preview: ${finding.preview}`));
        console.log();
      });
    };

    displayGroup(critical, 'CRITICAL', 'red');
    displayGroup(high, 'HIGH', 'yellow');
    displayGroup(medium, 'MEDIUM', 'blue');

    console.log(chalk.red.bold('⛔ COMMIT BLOCKED: Remove secrets before committing.\n'));
    console.log(chalk.gray('Options:'));
    console.log(chalk.gray('  • Run with --auto-remove flag to automatically clean secrets'));
    console.log(chalk.gray('  • Use environment variables for secrets'));
    console.log(chalk.gray('  • Store secrets in .env files (add to .gitignore)'));
    console.log(chalk.gray('  • Use secret management services\n'));
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const autoRemove = args.includes('--auto-remove') || args.includes('-r');
  
  const scanner = new SecretScanner(autoRemove);
  const isClean = await scanner.scan();
  process.exit(isClean ? 0 : 1);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

export default SecretScanner;

// Made with Bob
