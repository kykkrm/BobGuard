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
Scans staged files before every commit to detect and remove sensitive data.

**How it works:**
- Scans all staged files for API keys, tokens, passwords, and secrets
- Automatically removes detected secrets from the code
- Notifies you exactly which lines were removed and why
- Prevents accidental exposure before it reaches the repository

**Commands:**
```bash
# Scan for secrets only
node index.js scan

# Scan and auto-remove secrets
node index.js scan --auto-remove
```

**Example:**
```bash
$ node index.js scan
[Bob] Scanning for secrets...
[Bob] Found API key in src/config.js:12
[Bob] Removed: OPENAI_API_KEY="sk-proj-..."
[Bob] Your code is now safe to commit
```

---

### Feature 2: AI-Powered Commit Message Generator
Uses IBM watsonx.ai to analyze your code changes and generate descriptive commit messages.

**How it works:**
- Analyzes all staged changes after `git add`
- Sends actual code diffs to watsonx.ai (granite-8b-code-instruct model)
- Understands what was added, modified, or removed
- Generates a clear, semantic commit message
- Follows conventional commit format (feat, fix, refactor, etc.)
- Groups files by type for commits with >3 files

**Commands:**
```bash
# Generate AI commit message
node index.js commit
```

**Example:**
```bash
$ git add .
$ node index.js commit

[Bob] Analyzing changes...
[Bob] Generated commit message:
      "feat(core): add secret scanner and AI commit generator
      
      - secret-scanner.js: detects API keys and tokens
      - commit-message.js: integrates watsonx.ai for commit messages"

Commit with this message? (y/n): y
```

---

### Feature 3: Intelligent Auto-Merge
Reads all commit messages per branch, maps function ownership, and merges code intelligently.

**How it works:**
- Reads commit history from all branches
- Maps which developer wrote which function
- Detects semantic conflicts (not just text conflicts)
- Auto-renames duplicate functions instead of overwriting
- Keeps all functions — nothing gets deleted
- Fixes syntax errors after merge automatically
- No human decision needed

**Commands:**
```bash
# Smart merge with auto-resolution
node index.js merge <branch> --auto
```

**Example:**
```bash
Branch A: getUser() by Alice
Branch B: getUser() by Bob

GitHub "Accept Both" → keeps both, breaks syntax
BobGuard → renames to getUserFromDB() + getUserFromAPI()
```

---

### Feature 4: Full Workflow Guard
Combines secret scanning and AI commit generation in one command.

**Commands:**
```bash
# Run full workflow (scan + commit)
node index.js guard
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
node index.js guard
    ↓
[Bob] Scan secrets → remove + notify
    ↓
[Bob] Generate AI commit message → user confirms
    ↓
git commit -m "Generated message"
    ↓
git push
    ↓
node index.js merge feature-branch --auto
    ↓
[Bob] Read all commits → map ownership
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

- **IBM Bob IDE** — Used for building and developing the project
- **Node.js** — Runtime environment
- **simple-git** — Git operations library
- **IBM watsonx.ai API** — AI-powered commit message generation
  - Model: `ibm/granite-8b-code-instruct`
- **chalk** — Terminal colors and formatting
- **dotenv** — Environment variable management
- **Git + GitHub** — Version control foundation

---

## Getting Started

### Prerequisites
- Node.js installed
- Git configured
- IBM watsonx.ai account (for AI commit messages)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/bobguard.git
   cd bobguard
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure watsonx.ai credentials:**
   
   Create a `.env` file in the project root:
   ```bash
   WATSONX_API_KEY=your_ibm_cloud_api_key
   WATSONX_PROJECT_ID=your_watsonx_project_id
   ```

   Get your credentials from:
   - IBM Cloud API Key: https://cloud.ibm.com/iam/apikeys
   - watsonx.ai Project ID: https://dataplatform.cloud.ibm.com/wx/home

### Usage

**Scan for secrets:**
```bash
# Scan only
node index.js scan

# Scan and auto-remove
node index.js scan --auto-remove
```

**Generate AI commit message:**
```bash
git add .
node index.js commit

# The AI will analyze your changes and generate a commit message
# You'll be asked to confirm before committing
```

**Full workflow (scan + commit):**
```bash
git add .
node index.js guard
```

**Smart merge:**
```bash
node index.js merge feature-branch --auto
```

**Without watsonx.ai credentials:**
BobGuard will fall back to basic commit message generation based on file names.

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
3. Use `node index.js commit` for your commits
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

<div align="center">

*No function left behind.*

</div>
