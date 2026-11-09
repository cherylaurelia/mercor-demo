# close-check

Unofficial demo by Cheryl Aurelia: not affiliated with Mercor.

Practice any agent on the 10 open [APEX-Accounting](https://huggingface.co/datasets/mercor/apex-accounting-harbor) tasks and grade it with [Archipelago](https://github.com/Mercor-Intelligence/archipelago)'s real grader, with no Docker. The agent gets the files in a plain folder instead of the MCP world, which changes the task. Page: https://mercor-close-check.vercel.app

## Why

Mercor's [APEX-Accounting methodology](https://www.mercor.com/apex/apex-accounting-leaderboard/) says "The LM judge also penalizes scattergunning (hedging across several answers)." In Archipelago at 7b89770 that check is `scattergunning_guard`, which defaults to False (`grading/runner/evals/registry.py`), and all 10 open tasks ship `"eval_config_values": {}`. With a Sonnet judge through the unmodified grader, hedged answers that contain the right figure were credited on 58 of 69 criteria as shipped and 6 of 69 with the flag on; expert answers passed 89 of 89 both ways. The ApexAgents SkyRL recipe pins the grader at 79668ba, which has no guard code. Not run on the configured Gemini judge; the leaderboard uses an unreleased judge template, so this says nothing about published scores.

## The simple_task quick start, graded

At 7b89770, `examples/simple_task` builds a 17.2 GB image, then `POST /apps` returns 503 after 300 s with `No module named 'mcp_schema'` ([#96](https://github.com/Mercor-Intelligence/archipelago/issues/96)); `run.sh` is committed 100644. With #96's config change (`close_check/simple_task/mcp_config-96.diff`) the full path finishes: the agent reads the four images, answers `/animals/xk92m/qz7fw.png`, and the grader scores 1.0. Control: the same trajectory with the gorilla and cat paths swapped scores 0.0. Agent and judge were Claude Sonnet through `agent_shim.py`, an OpenAI-compatible shim set as `LITELLM_PROXY_API_BASE` that passes image parts to `claude -p` (models named `litellm_proxy/agent-*` and `litellm_proxy/judge-*`, see `model-routing.diff`). Trajectory and grades are in `close_check/simple_task/`.

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
