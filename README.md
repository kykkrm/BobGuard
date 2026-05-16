# BobGuard

**AI-Powered Git Workflow Guard**

BobGuard is an intelligent Git workflow layer that scans secrets, writes commit messages, and merges code intelligently — no function left behind.

---

## The Problem

Current Git workflows suffer from three critical problems that break collaboration and security:

### 1. **Meaningless Commit Messages**
Developers write vague commits like `"fix"`, `"update"`, or `"idk"` that give teammates no context of what actually changed, making code history useless for collaboration and review.

### 2. **Secret & API Key Leaks**
Developers accidentally push hardcoded secrets, API keys, and passwords to public repositories, causing security breaches and account suspension.

### 3. **Destructive Merges**
GitHub's "Accept Both" is purely text-based and does not understand code semantics, leading to:
- Broken logic
- Duplicate functions
- Accidental deletion of teammates' work

### Root Cause
Developers have to manually manage things that require understanding code — and humans make mistakes.

---

## The Solution

**BobGuard uses IBM Bob as an intelligent layer on top of Git** that understands code intent, not just text, to automatically handle secrets, commits, and merges safely.

Instead of treating code as plain text, Bob analyzes:
- **Code semantics** — what the code actually does
- **Developer intent** — what changes were made and why
- **Function ownership** — who wrote which parts
- **Logical conflicts** — not just text conflicts

---

## Features

### Feature 1: Secret Scanner
Bob scans staged files before every commit to detect and remove sensitive data.

**How it works:**
- Scans all staged files for API keys, tokens, passwords, and secrets
- Automatically removes detected secrets from the code
- Notifies you exactly which lines were removed and why
- Prevents accidental exposure before it reaches the repository

**Example:**
```bash
[Bob] Scanning for secrets...
[Bob] Found API key in src/config.js:12
[Bob] Removed: OPENAI_API_KEY="sk-proj-..."
[Bob] Your code is now safe to commit
```

---

### Feature 2: Smart Commit Message Generator
Bob reads your full diff and generates descriptive commit messages automatically.

**How it works:**
- Analyzes all staged changes after `git add`
- Understands what was added, modified, or removed
- Generates a clear, semantic commit message
- Follows conventional commit format (feat, fix, refactor, etc.)

**Example:**
```bash
git add .
/safe-commit

[Bob] Analyzing changes...
[Bob] Generated commit message:
      "feat: add payment handler, fix null check, remove hardcoded API key"

Confirm? (y/n)
```

---

### Feature 3: Intelligent Auto-Merge
Bob reads all commit messages per branch, maps function ownership, and merges code intelligently.

**How it works:**
- Reads commit history from all branches
- Maps which developer wrote which function
- Detects semantic conflicts (not just text conflicts)
- Auto-renames duplicate functions instead of overwriting
- Keeps all functions — nothing gets deleted
- Fixes syntax errors after merge automatically
- No human decision needed

**Example:**
```bash
Branch A: getUser() by Alice
Branch B: getUser() by Bob

GitHub "Accept Both" → keeps both, breaks syntax
BobGuard → renames to getUserFromDB() + getUserFromAPI()
```

---

## How BobGuard Differs from GitHub "Accept Both"

| Feature | GitHub "Accept Both" | BobGuard + IBM Bob |
|---------|---------------------|-------------------|
| **Conflict Resolution** | Text-based only | Semantic code understanding |
| **Duplicate Functions** | Keeps both, breaks syntax | Auto-renames intelligently |
| **Function Deletion** | May delete teammate's work | Keeps all functions |
| **Syntax Fixing** | Manual | Automatic |
| **Ownership Tracking** | None | Maps who wrote what |
| **Decision Required** | Yes, manual review | No, fully automatic |
| **Result** | May break logic | Always working code |

**Bottom Line:**
- **GitHub Accept Both** → combines text only, may break logic
- **BobGuard + Bob** → understands code, renames conflicts, keeps every function, fixes syntax

---

## Workflow

BobGuard integrates seamlessly into your existing Git workflow:

```bash
git add .
    ↓
/safe-commit
    ↓
[Bob] Scan secrets → remove + notify
    ↓
[Bob] Generate commit message → user confirms
    ↓
git commit -m "Generated message"
    ↓
git push
    ↓
[Bob] On PR: read all commits → map ownership
    ↓
[Bob] Detect semantic conflicts
    ↓
[Bob] Auto-rename duplicate functions
    ↓
[Bob] Keep all functions — nothing deleted
    ↓
[Bob] Fix syntax after merge
    ↓
[Bob] Auto-merge — no human decision needed
    ↓
Summary report of what was merged + renamed
```

---

## Merge Rules

Bob follows these 5 automatic rules when merging code:

1. **Different functions** → Merge both as-is
2. **Same name, different logic** → Auto-rename both (e.g., `getUser` → `getUserFromDB` + `getUserFromAPI`)
3. **Deleted but still in use** → Restore and keep the function
4. **Exact duplicate** → Keep one, discard the copy
5. **Syntax broken after merge** → Auto-fix syntax errors

**Result:** Every merge produces working, conflict-free code with zero manual intervention.

---

## Tech Stack

BobGuard is built with cutting-edge AI and Git integration:

- **IBM Bob IDE** — Core AI engine for code understanding
- **Bob Slash Command** (`/safe-commit`) — Custom workflow trigger
- **Bob MCP Server** — GitHub integration for PR automation
- **Git + GitHub** — Version control foundation

---

## Getting Started

### Prerequisites
- IBM Bob IDE installed
- Git configured
- GitHub repository

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/bobguard.git
   cd bobguard
   ```

2. **Configure Bob MCP Server:**
   ```bash
   # Add GitHub integration to Bob
   bob mcp add github
   ```

3. **Set up the `/safe-commit` command:**
   ```bash
   # Register the custom slash command
   bob command register safe-commit
   ```

### Usage

**Basic workflow:**
```bash
# Stage your changes
git add .

# Use BobGuard's safe commit
/safe-commit

# Bob will:
# 1. Scan for secrets
# 2. Generate commit message
# 3. Wait for your confirmation
# 4. Commit safely

# Push and let Bob handle merges
git push
```

**On Pull Requests:**
Bob automatically:
- Analyzes all commits
- Maps function ownership
- Resolves conflicts intelligently
- Merges without breaking code

---

## Built With IBM Bob

BobGuard is powered by **IBM Bob**, the AI-powered IDE that understands code, not just text.

Bob brings intelligence to every step of the development workflow:
- **Code Understanding** — Semantic analysis of your codebase
- **Intelligent Automation** — Smart decisions based on code intent
- **Developer Productivity** — Focus on building, not managing Git conflicts

Learn more about IBM Bob: [ibm.com/bob](https://ibm.com/bob)

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Use `/safe-commit` for your commits
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request (Bob will handle the merge!)

---

<div align="center">

*No function left behind.*

</div>
