# Router eval prompt

The single "common prompt" used by `/routing-eval` and `opencode-router eval` to
stress-test the scoring. It exercises planning, building, and testing in one task.

> In a fixture repo, build a CLI named `todo` with `add`, `list`, `done <id>`, and
> `rm <id>` subcommands backed by a JSON file. Include input validation, a `--json`
> output flag, and a test suite. Then fix any failing tests.

## What is measured

| Metric | Meaning |
| :-- | :-- |
| Latency (ms) | Wall-clock time to first full response |
| Tokens | Prompt + completion tokens reported by the API |
| Cost (USD) | Estimated from the model's blended rate |
| Static pass | 7 checks on the returned text (add, list, done, rm, `--json`, validation, tests) |

The report at `~/.config/opencode/router/eval-report.md` compares the **predicted rank** (from the score
table) with the **measured rank** (pass rate, then latency). Feed differences back
into `model-scores.json` or `router.config.json` -> `scores` to tune accuracy.

## Running

```bash
export OPENCODE_API_KEY=...        # Git Bash
$env:OPENCODE_API_KEY="..."        # PowerShell
opencode-router eval --plan go
```

Without `OPENCODE_API_KEY` the command writes a predicted-only report and makes
no network calls.
