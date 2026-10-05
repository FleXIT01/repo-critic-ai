# repo-critic-ai

A local developer agent that analyses a GitHub repository and returns a structured quality report with a health score (0–100).

Works without any configuration — just point it at a repo.  
Optionally plug in an LLM (Ollama, OpenAI, LM Studio) for AI-generated summaries.

---

## Quick Start

**Easiest — Python launcher (Linux, macOS, Windows):**
```bash
# Linux / macOS:
python3 start.py                         # web UI at http://localhost:3000
python3 start.py analyze owner/repo      # CLI analysis
# Or directly (executable on Linux/macOS):
./start.py analyze owner/repo

# Windows:
python start.py                          # web UI at http://localhost:3000
python start.py analyze owner/repo       # CLI analysis
```

**Or directly with npm:**
```bash
npm install
npx tsx src/index.ts analyze microsoft/vscode
npx tsx src/index.ts web
```

---

## Installation

Requires **Node.js 22+** and **Python 3.8+** (for the launcher).

```bash
git clone https://github.com/FleXIT01/repo-critic-ai.git
cd repo-critic-ai
npm install
```

> **Linux Note:**
> Make sure `node -v` reports v22+ (e.g., install via [nvm](https://github.com/nvm-sh/nvm): `nvm install 22 && nvm use 22`).
> `start.py` is executable by default on Linux/macOS (`chmod +x start.py`).

---

## Usage

### Python launcher (`start.py`)

```bash
# Linux / macOS:
python3 start.py                                  # start web UI (default port 3000)
python3 start.py web --port 8080                  # custom port
python3 start.py analyze owner/repo               # CLI: print Markdown report
python3 start.py analyze owner/repo --improve-readme  # with suggested README improvements
python3 start.py analyze owner/repo --json        # CLI: raw JSON output
python3 start.py analyze owner/repo --no-llm      # disable LLM calls

# Windows:
python start.py analyze owner/repo
```

The launcher auto-runs `npm install` on first start.

### Web Interface

```bash
npx tsx src/index.ts web
```

Open [http://localhost:3000](http://localhost:3000), enter a GitHub URL or `owner/repo`, and click **Analyse**.
The Web UI features client-side sanitization (DOMPurify) and a one-click button to generate suggested README improvements and diffs.

### CLI

```bash
# Basic (unauthenticated — 60 API req/hour limit)
npx tsx src/index.ts analyze facebook/react

# With GitHub token (5 000 req/hour, required for private repos)
# Linux / macOS:
GITHUB_TOKEN=ghp_... npx tsx src/index.ts analyze your-org/private-repo
# Windows PowerShell:
$env:GITHUB_TOKEN="ghp_..."; npx tsx src/index.ts analyze your-org/private-repo

# Generate suggested README improvements & diff
npx tsx src/index.ts analyze owner/repo --improve-readme
# Or standalone README inspection:
npx tsx src/index.ts improve-readme owner/repo

# With local Ollama for AI summaries
LLM_API_KEY=ollama npx tsx src/index.ts analyze owner/repo

# JSON output (pipe to jq, save to file, etc.)
npx tsx src/index.ts analyze owner/repo --json | jq .score
```

---

## Configuration

All settings via environment variables — no config file needed:

| Variable | Description | Default |
|---|---|---|
| `GITHUB_TOKEN` | GitHub personal access token | unauthenticated (60 req/h) |
| `LLM_API_KEY` | API key for the LLM backend | *(LLM disabled)* |
| `LLM_BASE_URL` | Base URL for OpenAI-compatible API | `http://localhost:11434/v1` |
| `LLM_MODEL` | Model name | `llama3` |

### Connecting an LLM

LLM calls are **always optional** — the tool gives full results without them.
Set `LLM_API_KEY` to enable AI-generated health summaries.

**Ollama (local, free):**
```bash
# Install Ollama: https://ollama.com
ollama pull llama3
LLM_API_KEY=ollama npx tsx src/index.ts analyze owner/repo
```

**OpenAI:**
```bash
LLM_API_KEY=sk-... LLM_MODEL=gpt-4o-mini npx tsx src/index.ts analyze owner/repo
```

**LM Studio:**
```bash
LLM_API_KEY=lm-studio LLM_BASE_URL=http://localhost:1234/v1 \
  LLM_MODEL=your-model npx tsx src/index.ts analyze owner/repo
```

---

## Health Score

The score (0–100) is a weighted average of four dimensions:

| Dimension | Weight | What is checked |
|---|---|---|
| **README Quality** | 30 % | Present, length, install/usage sections, code examples |
| **Security** | 30 % | No committed `.env`/key files, no hardcoded API keys |
| **TODO / FIXME** | 20 % | Fewer high-priority comments = higher score |
| **Issue Quality** | 20 % | Average quality of open GitHub issues |

Grade scale: **A** ≥ 80 · **B** ≥ 65 · **C** ≥ 50 · **D** ≥ 35 · **F** < 35

If a tool is skipped (e.g. no issues exist, or no source files found), the remaining weights are re-normalised automatically.

---

## Project Structure

```
src/
├── index.ts                 CLI entry point (analyze + web commands)
├── agent/
│   ├── RepoAgent.ts         Orchestrates tools, computes composite score
│   ├── planner.ts           Decides which tools to run per repo
│   └── memory.ts            In-memory report store for the web server
├── tools/
│   ├── repoReader.ts        GitHub API: metadata, README, file tree
│   ├── readmeAnalyzer.ts    README scoring (rule-based, no LLM required)
│   ├── todoScanner.ts       TODO/FIXME/HACK/NOTE comment scanner
│   ├── securityChecker.ts   Sensitive file detection + secret pattern scan
│   ├── issueHelper.ts       GitHub issue quality evaluation
│   └── reportGenerator.ts  Markdown report builder (pure function)
├── llm/
│   ├── client.ts            OpenAI-compatible LLM wrapper (optional)
│   └── prompts.ts           Centralised prompt templates
├── web/
│   ├── server.ts            Hono HTTP server
│   ├── routes/
│   │   ├── analyze.ts       POST /analyze
│   │   └── report.ts        GET /report + GET /report/:id
│   └── public/index.html    Web UI (dark theme, marked.js rendering)
└── types/index.ts           Shared TypeScript interfaces
tests/
├── readmeAnalyzer.test.ts
├── planner.test.ts
├── memory.test.ts
├── llmClient.test.ts
└── reportGenerator.test.ts
```

---

## Development

```bash
npm test              # run test suite (Vitest)
npm run lint          # Biome lint + format check
npm run build         # compile TypeScript to dist/
npm run dev           # run CLI via tsx (no build step)
```

---

## API (Web Server)

| Method | Path | Body / Params | Description |
|---|---|---|---|
| `GET` | `/` | — | Web UI |
| `POST` | `/analyze` | `{ repoUrl: string }` | Start analysis, returns `{ id, score, grade, summary }` |
| `POST` | `/analyze/improve-readme` | `{ repoUrl: string }` | Analyze README section gaps & generate unified diff |
| `GET` | `/report/:id` | — | Full `HealthReport` JSON |
| `GET` | `/report` | — | List of all stored reports |

---

## License

MIT
