#!/usr/bin/env python3
"""close-check: run any agent on the open APEX-Accounting world and grade it with Archipelago's real grader.

No Docker and no Harbor images. The agent gets the same files and prompts in a plain folder instead of the MCP world, which
changes the task, so this is practice, not an APEX-Accounting score. Data: mercor/apex-accounting-harbor (CC-BY 4.0). Grader: Mercor-Intelligence/archipelago.

  close_check.py setup
  close_check.py run --agent 'claude -p --allowedTools Bash,Read' --reps 1 [--tasks 30,4]
  close_check.py grade --judge claude:haiku          # or any LiteLLM id, e.g. gemini/gemini-3-flash-preview with GOOGLE_API_KEY
  close_check.py check-judge --judge claude:haiku [--guard]
  close_check.py report [--verdicts]
"""
import argparse, json, os, re, shlex, shutil, subprocess, sys, tarfile, tempfile, threading, time, zipfile
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOME = Path(os.environ.get("CLOSE_CHECK_HOME", Path.cwd() / ".close-check")).resolve()
DATA, GRADER, WORLD, RUNS = HOME / "data", HOME / "archipelago", HOME / "world", HOME / "runs"
GRADER_COMMIT = "7b8977014db3e56a4f054b013398fd1e8953b1e7"
SHIM_PORT = 8791
FILES = ["tasks/*/instruction.md", "tasks/*/tests/grading_config.json", "tasks/*/tests/golden_responses.json",
         "tasks/*/environment/task_files/filesystem/*", "worlds/*/filesystem.tar.gz", "worlds/*/apps_data.tar.gz"]


def sh(cmd, **kw):
    subprocess.run(cmd, check=True, **kw)


def setup():
    HOME.mkdir(parents=True, exist_ok=True)
    include = [x for f in FILES for x in ("--include", f)]
    sh(["uvx", "--from", "huggingface_hub", "hf", "download", "mercor/apex-accounting-harbor", "--repo-type", "dataset",
        "--local-dir", str(DATA), *include])
    if not GRADER.exists():
        sh(["git", "clone", "-q", "https://github.com/Mercor-Intelligence/archipelago.git", str(GRADER)])
    sh(["git", "-C", str(GRADER), "checkout", "-q", GRADER_COMMIT])
    sh(["uv", "sync", "--locked", "--quiet"], cwd=GRADER / "grading")
    world = next((DATA / "worlds").iterdir())
    for name, dest in (("filesystem", WORLD / "filesystem"), ("apps_data", WORLD / "apps_data")):
        dest.mkdir(parents=True, exist_ok=True)
        with tarfile.open(world / f"{name}.tar.gz") as tar:
            tar.extractall(dest, filter="data")
    print(f"ready: {len(tasks())} tasks in {HOME}")


def tasks(selected=None):
    names = sorted(p.name for p in (DATA / "tasks").iterdir())
    if not selected:
        return names
    wanted = {f"world-9-task-{n}-" for n in selected.split(",")}
    return [n for n in names if any(n.startswith(w) for w in wanted)]


def prompt_for(task):
    body = (DATA / "tasks" / task / "instruction.md").read_text().split("\n---\n", 1)[1].strip()
    return ("You are working in a simulated workplace. The firm's documents are in ./filesystem and its accounting system "
            "exports are in ./apps_data/quickbooks. Your last message is your deliverable, so put the complete answer in it."
            "\n\n---\n\n" + body)


def run_agent(task, rep, agent, timeout):
    out = RUNS / f"{task}__r{rep}"
    if (out / "result.json").exists():
        return
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir="/tmp", prefix="close-check-") as ws:
        ws = Path(ws)
        shutil.copytree(WORLD / "filesystem", ws / "filesystem")
        shutil.copytree(WORLD / "apps_data", ws / "apps_data")
        extra = DATA / "tasks" / task / "environment/task_files/filesystem"
        if extra.exists():
            shutil.copytree(extra, ws / "filesystem", dirs_exist_ok=True)
        start = time.time()
        try:
            r = subprocess.run(shlex.split(agent), input=prompt_for(task), cwd=ws, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            (out / "error.txt").write_text(f"agent timed out after {timeout}s")
            print(f"{task} r{rep}: timed out")
            return
    if r.returncode or not r.stdout.strip():
        (out / "error.txt").write_text(r.stderr[-2000:] or "agent printed nothing")
        print(f"{task} r{rep}: agent failed, see {out/'error.txt'}")
        return
    (out / "result.json").write_text(json.dumps({"task": task, "rep": rep, "answer": r.stdout.strip(), "seconds": round(time.time() - start)}, indent=1))
    print(f"{task} r{rep}: {round(time.time()-start)}s")


class ClaudeJudge(BaseHTTPRequestHandler):
    """OpenAI-style /chat/completions backed by `claude -p`, so the unmodified grader runs without an API key."""
    model = "haiku"

    def log_message(self, *a):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["content-length"])))
        def text(c):
            return c if isinstance(c, str) else "".join(p.get("text", "") for p in c or [] if isinstance(p, dict))
        system = "\n".join(text(m["content"]) for m in body["messages"] if m["role"] == "system")
        user = "\n\n".join(text(m["content"]) for m in body["messages"] if m["role"] != "system")
        schema = ((body.get("response_format") or {}).get("json_schema") or {}).get("schema")
        hint = "\n\nRespond with only a JSON object" + (f" matching this schema: {json.dumps(schema)}" if schema else " with keys rationale and is_criteria_true") + ". No code fence."
        r = subprocess.run(["claude", "-p", "--model", self.model, "--setting-sources", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
                            "--tools", "", "--system-prompt", system + hint], input=user, capture_output=True, text=True, cwd="/tmp", timeout=280)
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", r.stdout.strip())
        reply = json.dumps({"id": "c", "object": "chat.completion", "created": int(time.time()), "model": body["model"],
                            "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
                            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(reply)))
        self.end_headers()
        self.wfile.write(reply)


def judge_env(judge):
    """Returns (litellm model id, extra env). claude:<model> starts the local shim."""
    if not judge.startswith("claude:"):
        return judge, {}
    ClaudeJudge.model = judge.split(":", 1)[1]
    server = ThreadingHTTPServer(("127.0.0.1", SHIM_PORT), ClaudeJudge)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return "openai/judge", {"LITELLM_PROXY_API_BASE": f"http://127.0.0.1:{SHIM_PORT}", "LITELLM_PROXY_API_KEY": "local"}


def grade(task, answer, model, env, guard=False, only=None):
    cfg = json.loads((DATA / "tasks" / task / "tests/grading_config.json").read_text())
    if guard:
        for e in cfg["eval_configs"]:
            e["eval_config_values"] = {**(e.get("eval_config_values") or {}), "scattergunning_guard": True}
    verifiers = [v for v in cfg["verifiers"] if only is None or v["verifier_index"] in only]
    prompt = (DATA / "tasks" / task / "instruction.md").read_text().split("\n---\n", 1)[1].strip()
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        with zipfile.ZipFile(t / "empty.zip", "w"):
            pass
        inputs = {"trajectory": {"messages": [{"role": "user", "content": prompt}, {"role": "assistant", "content": answer}], "status": "completed", "time_elapsed": 1.0, "output": {}},
                  "settings": {"llm_judge_model": model, "llm_judge_extra_args": None}, "verifiers": verifiers,
                  "evals": cfg["eval_configs"], "scoring": cfg["scoring_config"]}
        for name, value in inputs.items():
            (t / f"{name}.json").write_text(json.dumps(value))
        r = subprocess.run([str(GRADER / "grading/.venv/bin/python"), "-m", "runner.main", "--grading-run-id", "gr", "--trajectory-id", "t",
                            "--initial-snapshot", str(t / "empty.zip"), "--final-snapshot", str(t / "empty.zip"), "--trajectory", str(t / "trajectory.json"),
                            "--grading-settings", str(t / "settings.json"), "--verifiers", str(t / "verifiers.json"), "--eval-configs", str(t / "evals.json"),
                            "--scoring-config", str(t / "scoring.json"), "--output", str(t / "grades.json")],
                           cwd=GRADER / "grading", env={**os.environ, **env}, capture_output=True, text=True)
        if not (t / "grades.json").exists():
            raise RuntimeError(f"{task}: grader wrote no result\n{r.stderr[-1500:]}")
        grades = json.loads((t / "grades.json").read_text())
    if grades.get("grading_run_status") != "completed":
        raise RuntimeError(f"{task}: grader status {grades.get('grading_run_status')}")
    by_id = {v["verifier_id"]: v for v in verifiers}
    def row(x):
        values = x.get("verifier_result_values") or {}
        verdict = values.get("judge_grade")
        return {"index": by_id[x["verifier_id"]]["verifier_index"], "criterion": by_id[x["verifier_id"]]["verifier_values"]["criteria"],
                "met": verdict == "pass" and x.get("score") == 1, "judge_error": verdict not in ("pass", "fail"), "rationale": values.get("grade_rationale", "")}
    return [row(x) for x in grades["verifier_results"]]


def cmd_grade(a):
    model, env = judge_env(a.judge)
    selected = tasks(a.tasks)
    results = sorted(p for p in RUNS.glob("*/result.json") if p.parent.name.split("__")[0] in selected)
    def one(p):
        r = json.loads(p.read_text())
        out = p.parent / f"grades-{a.judge.replace('/', '_').replace(':', '_')}{'-guard' if a.guard else ''}.json"
        if out.exists():
            return
        out.write_text(json.dumps(grade(r["task"], r["answer"], model, env, a.guard), indent=1))
        print("graded", p.parent.name)
    with ThreadPoolExecutor(a.parallel) as ex:
        list(ex.map(one, results))
    cmd_report(a)


def cmd_report(a):
    totals = {}
    for p in sorted(RUNS.glob("*/grades-*.json")):
        grades = json.loads(p.read_text())
        judge = p.stem.removeprefix("grades-")
        met, errors = sum(x["met"] for x in grades), sum(x.get("judge_error", False) for x in grades)
        t = totals.setdefault(judge, [0, 0, 0])
        t[0] += met
        t[1] += len(grades) - errors
        t[2] += errors
        print(f"{p.parent.name:45} {judge:24} {met:>3}/{len(grades) - errors}" + (f"  ({errors} judge errors)" if errors else ""))
        if getattr(a, "verdicts", False):
            for x in sorted(grades, key=lambda g: g["index"]):
                label = "ERROR" if x.get("judge_error") else "met" if x["met"] else "not met"
                print(f"  [{label}] {x['criterion']}\n      {x['rationale'][:400]}")
    if not totals:
        sys.exit("nothing graded yet")
    print()
    for judge, (met, graded, errors) in totals.items():
        print(f"{judge}: {met}/{graded} criteria met, {errors} judge errors")
    print("Practice on the open dev set in a plain folder, not an APEX-Accounting score.")


AMOUNT = re.compile(r"\d[\d,]*\.\d\d%?|\d{1,3}(?:,\d{3})+")


def hedged(answer, a):
    digits = [i for i, c in enumerate(a) if c.isdigit()]
    i = digits[1] if len(digits) > 1 else digits[0]
    other = a[:i] + str((int(a[i]) + 3) % 10) + a[i + 1:]
    money = "" if a.endswith("%") else "$"
    return re.sub(r"(?<![\d,.])" + re.escape(a) + r"(?![\d,]|\.\d)", lambda _: f"{a} (or possibly {money}{other}, depending on treatment)", answer)


def cmd_check_judge(a):
    """The expert answer must pass; a blank must fail; the expert answer with one figure hedged should fail."""
    model, env = judge_env(a.judge)
    sel = tasks(a.tasks)
    golden_ok = blank = hedge = total_h = 0
    golden_total = 0
    def h_one(job):
        t, i, ans = job
        return grade(t, ans, model, env, a.guard, {i})[0]["met"]
    jobs = []
    for t in sel:
        cfg = json.loads((DATA / "tasks" / t / "tests/grading_config.json").read_text())
        gold = json.loads((DATA / "tasks" / t / "tests/golden_responses.json").read_text())[0]["golden_text_response"]
        g = grade(t, gold, model, env, a.guard)
        golden_ok += sum(x["met"] for x in g)
        golden_total += len(g)
        blank += sum(x["met"] for x in grade(t, "I could not complete this task.", model, env, a.guard))
        for v in cfg["verifiers"]:
            head = re.split(r"\(\s*[Aa]cceptable", v["verifier_values"]["criteria"])[0]
            m = next((x.group() for x in AMOUNT.finditer(head) if x.group() in gold and re.sub(r"\D", "", x.group()).strip("0")), None)
            if m:
                jobs.append((t, v["verifier_index"], hedged(gold, m)))
    with ThreadPoolExecutor(a.parallel) as ex:
        res = list(ex.map(h_one, jobs))
    hedge, total_h = sum(res), len(res)
    print(f"judge {a.judge}, scattergunning_guard {'on' if a.guard else 'off (as shipped)'}")
    print(f"expert answer met    {golden_ok}/{golden_total} (want all)")
    print(f"blank answer met     {blank}/{golden_total} (want 0)")
    print(f"hedged figure met    {hedge}/{total_h} (want 0)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("setup")
    r = sub.add_parser("run")
    r.add_argument("--agent", required=True, help="command that reads the prompt on stdin and prints the answer; runs inside the task folder")
    r.add_argument("--reps", type=int, default=1)
    r.add_argument("--tasks", help="comma-separated task numbers, e.g. 30,4")
    r.add_argument("--parallel", type=int, default=3)
    r.add_argument("--timeout", type=int, default=2400)
    for name in ("grade", "check-judge"):
        g = sub.add_parser(name)
        g.add_argument("--judge", required=True)
        g.add_argument("--guard", action="store_true", help="turn on scattergunning_guard")
        g.add_argument("--parallel", type=int, default=4)
        g.add_argument("--tasks")
    rep = sub.add_parser("report")
    rep.add_argument("--verdicts", action="store_true", help="print each criterion's verdict and the judge's rationale")
    a = ap.parse_args()
    if a.cmd == "setup":
        setup()
    elif a.cmd == "run":
        jobs = [(t, rep) for rep in range(1, a.reps + 1) for t in tasks(a.tasks)]
        with ThreadPoolExecutor(a.parallel) as ex:
            list(ex.map(lambda j: run_agent(j[0], j[1], a.agent, a.timeout), jobs))
    elif a.cmd == "grade":
        cmd_grade(a)
    elif a.cmd == "check-judge":
        cmd_check_judge(a)
    else:
        cmd_report(a)


if __name__ == "__main__":
    main()
