# 🧠 Copilot Memory Bank Template

A template to turn **GitHub Copilot** into a goal-oriented, memory-persistent coding assistant — inspired by [AWS Kiro](https://dev.to/aws-builders/introducing-kiro-an-ai-ide-that-thinks-like-a-developer-42jp).

Use this setup to guide Copilot from **spec → design → tasks → tested code** while maintaining project context across sessions.

📝 Read the full Medium article:  
**[Beyond Autocomplete: Give Copilot a Memory and a Brain](https://medium.com/@mrBallistic/how-to-give-github-copilot-a-photographic-memory-and-a-kiro-style-brain-3eafeafa4b85)**

And the followup:
**[From Prompt to Product](https://medium.com/@mrBallistic/from-prompt-to-product-8c1f3bd9b8e0)**

---

## 🧩 What's Inside

### `.github/`
- `copilot-instructions.md` — Tiny bootstrap that tells Copilot to use the memory bank and follow the Kiro-Lite process
- `prompts/kiro-lite.prompt.md` — A multi-phase, slash-command-based prompt that emulates Kiro’s spec-driven workflow

### `memory-bank/`
- `memory-bank-instructions.md` — Defines the memory system, file structure, workflows, and update process
- `copilot-rules.md` — Captures project constraints, rules, and security policies
- Core context files:
  - `projectbrief.md`
  - `productContext.md`
  - `systemPatterns.md`
  - `techContext.md`
  - `activeContext.md`
  - `progress.md`
- `feature-template/` — A starter folder for scoped PRD/design/task files (copied by Copilot during `/start feature`)

---

## 🚦 Supported Slash Commands

Copilot only acts when triggered with these:

| Command                 | Purpose                                    |
|------------------------|--------------------------------------------|
| `/start feature <name>`| Initializes folder + memory files          |
| `/approve prd`         | Locks PRD and moves to design              |
| `/approve design`      | Locks design and moves to task breakdown   |
| `/approve tasks`       | Locks task plan and allows coding          |
| `/implement <TASK_ID>` | Generates code + tests for a single task   |
| `/review complete`     | Confirms task is done                      |
| `/update memory bank`  | Refreshes context and progress files       |

---

## ✅ How to Use

1. 🧠 Clone the repo
2. 🔌 Add `.github/copilot-instructions.md` to your working repo
3. 📁 Copy the `/memory-bank/` structure and fill in your context
4. 💬 Paste the `kiro-lite.prompt.md` into Copilot Chat
5. 🚀 Start building with `/start feature <name>`

---

## 📸 Example Session

```bash
/start feature auth-login
# Copilot creates: /memory-bank/auth-login/{prd.md, design.md, ...}

[ you describe the PRD ]

/approve prd
# Copilot writes design.md

/approve design
# Copilot writes tasks.md

/implement AUTH-1
# Copilot generates file diff + tests
```

## 🧪 Want to extend it?

* Add /memory-bank/commands.md as a cheatsheet
* Use GitHub Actions to validate memory structure on PRs
* Build an onboarding doc for new team members

## 📖 License

MIT — use it, fork it, remix it. Just don’t let your assistant commit secrets. 😉