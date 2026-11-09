import data from "../data/summary.json";
import { Explorer } from "./explorer";

const REPO = "https://github.com/cherylaurelia/mercor-demo";
const s = data.summary;
const frac = (v: number[]) => `${v[0]} of ${v[1]}`;
const totalMet = data.index.flatMap((t) => t.runs).reduce((sum, r) => sum + r.met, 0);
const totalCriteria = data.index.flatMap((t) => t.runs).reduce((sum, r) => sum + r.total, 0);

export default function Page() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
      <p className="text-sm text-neutral-600">Built on APEX-Accounting and Archipelago</p>
      <h1 className="mt-3 text-4xl font-normal tracking-tight sm:text-5xl">Your methodology says the judge penalizes hedging. In the public task configs, that check is off.</h1>
      <p className="mt-6 text-lg text-neutral-800">
        <code className="text-base">scattergunning_guard</code> defaults to False and all 10 open APEX-Accounting tasks ship <code className="text-base">{"\"eval_config_values\": {}"}</code>. Through your unmodified grader with a Sonnet judge, answers that keep the right figure and add &quot;or possibly $X&quot; got credit on {frac(s.hedge.sonnet.off)} criteria. With the flag on: {frac(s.hedge.sonnet.on)}. Expert answers stayed at {frac(s.golden.sonnet.on)}.
      </p>
      <p className="mt-2 text-lg text-neutral-800">
        The fix is one config value per task: <code className="text-base">{"\"scattergunning_guard\": true"}</code>.
      </p>
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <a href={REPO} className="rounded bg-black px-4 py-2 text-white">View the repo</a>
        <a href="#guard" className="rounded border border-neutral-300 px-4 py-2">Guard results</a>
        <a href="#quickstart" className="rounded border border-neutral-300 px-4 py-2">Quick start, graded</a>
      </div>

      <section id="guard" className="mt-14 scroll-mt-6">
        <h2 className="text-2xl font-normal">What the guard changes</h2>
        <table className="mt-4 w-full text-left text-sm">
          <thead><tr className="border-b border-neutral-200"><th className="py-2 font-medium">Answers (Sonnet judge)</th><th className="py-2 font-medium">Guard off (as shipped)</th><th className="py-2 font-medium">Guard on</th></tr></thead>
          <tbody>
            <tr className="border-b border-neutral-100"><td className="py-2">Right figure plus hedges</td><td>{frac(s.hedge.sonnet.off)}</td><td>{frac(s.hedge.sonnet.on)}</td></tr>
            <tr className="border-b border-neutral-100"><td className="py-2">Expert answers</td><td>{frac(s.golden.sonnet.off)}</td><td>{frac(s.golden.sonnet.on)}</td></tr>
            <tr><td className="py-2">Pinned SkyRL grader (79668ba)</td><td>{frac(s.hedge.sonnet.pinned)}</td><td>no guard code</td></tr>
          </tbody>
        </table>
        <p className="mt-4 text-neutral-800">
          It matters most for training. The ApexAgents SkyRL recipe uses the judge&apos;s per-criterion scores as the reward and pins the grader at 79668ba, which predates the guard, so a policy trained there can&apos;t be penalized for hedging whatever the task config says.
        </p>
        <h3 className="mt-6 text-lg font-normal">One real flip, not a synthetic hedge</h3>
        <p className="mt-2 text-neutral-800">
          In a recorded Claude Code run on task 30, the agent&apos;s &quot;primary answer&quot; put the 1–30 day bucket at 12.25%, and a third table showed 10.85%, the rubric&apos;s figure. Guard off: credited. Guard on: <span className="italic">&quot;Presenting several candidate bucket values, with the primary one different from the criterion value, is hedging. The criterion is therefore not met.&quot;</span>
        </p>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium">Limits</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-neutral-800">
            <li>The leaderboard uses an unreleased judge template, so this is not a claim about published scores.</li>
            <li>Not run on gemini-3-flash-preview (no Google key). Haiku credited {frac(s.hedge.haiku.off)} hedges, {frac(s.hedge.haiku.on)} with the flag. The flag did not stop gpt-oss-20b, which credited {s.gptoss.on} of {s.gptoss.pairs}.</li>
            <li>The hedged answers are built from the expert answer. Honest Claude Code runs rarely hedged: 2 verdicts flipped across 80 gradings. Wrong digits ({frac(s.sonnet.wrongDigit)}) and swapped amounts ({frac(s.sonnet.swap)}) were caught either way.</li>
          </ul>
        </details>
      </section>

      <section id="quickstart" className="mt-14 scroll-mt-6">
        <h2 className="text-2xl font-normal">The simple_task quick start, graded end to end</h2>
        <p className="mt-3 text-neutral-800">
          New here: <a className="underline" href="https://github.com/Mercor-Intelligence/archipelago/issues/96">#96</a> still reproduces at 7b89770, <code className="text-sm">run.sh</code> is committed 100644 (&quot;Permission denied&quot; on a fresh clone), and with #96&apos;s config change the whole path now finishes with a score:
        </p>
        <pre className="mt-4 overflow-x-auto bg-neutral-50 p-4 text-sm leading-6">{`# examples/simple_task/mcp_config.json (#96, davidlibland)
- "command": "python",  "args": ["main.py"]
+ "command": "uv",      "args": ["run", "python", "main.py"]
+ "env": { "MCP_TRANSPORT": "stdio", ... }

As shipped: POST /apps 503 after 300 s (No module named 'mcp_schema')
Patched:    POST /apps 200
            agent reads all 4 images with read_image_file
            final_answer "/animals/xk92m/qz7fw.png"
            grader: PASS, final score 1.0
Control:    same run, gorilla and cat paths swapped: FAIL, 0.0`}</pre>
        <p className="mt-2 text-sm text-neutral-600">
          Agent and judge are Claude Sonnet through a small OpenAI-compatible shim for your LiteLLM proxy setting (<code>close_check/simple_task/agent_shim.py</code>; it passes image parts to the model), not the configured Gemini models. The trajectory, both grades and the shim are in the repo.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-normal">Check a judge yourself, no Docker</h2>
        <pre className="mt-4 overflow-x-auto bg-neutral-50 p-4 text-sm leading-6">{`python3 close_check.py setup      # 21 s, empty folder to ready
python3 close_check.py check-judge --judge claude:sonnet --guard
python3 close_check.py run --agent 'claude -p --model sonnet --allowedTools Bash,Read,Glob,Grep'
python3 close_check.py grade --judge claude:haiku`}</pre>
        <p className="mt-3 text-sm text-neutral-700">
          close-check runs the 10 open tasks with the same prompts, rubrics and unmodified grader. The judge is any LiteLLM model id, or <code>claude:&lt;model&gt;</code> for no API key. Agents get files instead of MCP tools or QuickBooks, so agent scores are practice, not APEX-Accounting.
        </p>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">All 20 recorded Claude Code runs ({totalMet} of {totalCriteria} criteria, Haiku judge)</summary>
          <div className="mt-4"><Explorer index={data.index} /></div>
        </details>
      </section>

      <footer className="mt-16 border-t border-neutral-200 pt-6 text-sm text-neutral-600">
        <p>Unofficial demo by Cheryl Aurelia: not affiliated with Mercor.</p>
        <p className="mt-2">
          Prompts and rubrics from <a className="underline" href="https://huggingface.co/datasets/mercor/apex-accounting-harbor">mercor/apex-accounting-harbor</a> (CC-BY 4.0), unchanged. Grader: <a className="underline" href="https://github.com/Mercor-Intelligence/archipelago">Mercor-Intelligence/archipelago</a> at 7b89770, unmodified.
        </p>
      </footer>
    </main>
  );
}
