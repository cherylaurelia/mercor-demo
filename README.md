# close-check

Unofficial demo by Cheryl Aurelia: not affiliated with Mercor.

Practice any agent on the 10 open [APEX-Accounting](https://huggingface.co/datasets/mercor/apex-accounting-harbor) tasks and grade it with [Archipelago](https://github.com/Mercor-Intelligence/archipelago)'s real grader, with no Docker. The agent gets the files in a plain folder instead of the MCP world, which changes the task. Page: https://mercor-close-check.vercel.app

## Why

At Archipelago commit 7b89770 (2026-11-09), the documented `examples/simple_task` flow builds a 17.2 GB image, then `POST /apps` returns 503 after 5 minutes with `No module named 'mcp_schema'` ([#96](https://github.com/Mercor-Intelligence/archipelago/issues/96)). The two config changes from #96 gave a 200 in 1.9 s here.

## Use

Needs Python 3 and [uv](https://docs.astral.sh/uv/).

```
python3 close_check/close_check.py setup
python3 close_check/close_check.py run --agent 'claude -p --model sonnet --allowedTools Bash,Read,Glob,Grep'
python3 close_check/close_check.py grade --judge claude:haiku
python3 close_check/close_check.py report --verdicts
python3 close_check/close_check.py check-judge --judge claude:haiku          # add --guard to compare
```

The agent is any command that reads the prompt on stdin and prints its answer. The judge is any LiteLLM model id (keys from your environment), or `claude:<model>` to use the Claude Code CLI with no API key. `setup` skips the image archives and each task's `mercor.json`.

Results are practice on the open dev set, not APEX-Accounting scores: there's no MCP world or QuickBooks interface, and the dataset README says dev results must not be reported as such. Prompts and rubrics are CC-BY 4.0, Mercor.

## Page

`npm install && npm run dev`. `data/` holds recorded runs: Claude Code answers, judge verdicts and control totals.
