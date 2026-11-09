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
      <h1 className="mt-3 text-4xl font-normal tracking-tight sm:text-5xl">Your quick start fails on today&apos;s main. Two config lines fix it.</h1>
      <p className="mt-6 text-lg text-neutral-800">
        At 7b89770, <code className="text-base">examples/simple_task</code> builds a 17 GB image, then <code className="text-base">POST /apps</code> returns 503 after 300 s (#96, open since June). With #96&apos;s two lines and a chmod, it returns 200 in 1.9 s.
      </p>
      <p className="mt-2 text-lg text-neutral-800">
        Meanwhile, close-check runs the 10 open tasks with the same prompts, rubrics and grader, using files instead of MCP tools. Scores are practice, not APEX-Accounting.
      </p>
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <a href={REPO} className="rounded bg-black px-4 py-2 text-white">View the repo</a>
        <a href="#fix" className="rounded border border-neutral-300 px-4 py-2">See the fix</a>
        <a href="#report" className="rounded border border-neutral-300 px-4 py-2">Read a real report</a>
      </div>

      <section id="fix" className="mt-14 scroll-mt-6">
        <h2 className="text-2xl font-normal">The fix, retested</h2>
        <p className="mt-3 text-neutral-800">
          I followed <code className="text-sm">examples/simple_task</code> at commit 7b89770. It still fails the way <a className="underline" href="https://github.com/Mercor-Intelligence/archipelago/issues/96">#96</a> described in June. Also, <code className="text-sm">run.sh</code> is committed without execute permission, so <code className="text-sm">./run.sh</code> gives &quot;Permission denied&quot; on a fresh clone. <code className="text-sm">git update-index --chmod=+x examples/*/run.sh</code> fixes it. The two changes #96 proposes work:
        </p>
        <pre className="mt-4 overflow-x-auto bg-neutral-50 p-4 text-sm leading-6">{`# the fix proposed in #96, retested on 7b89770
# examples/simple_task/mcp_config.json
- "command": "python",
+ "command": "/app/mcp_servers/filesystem/.venv/bin/python",
+ "env": { "MCP_TRANSPORT": "stdio", ... }

As shipped   POST /apps  503 after 300 s  No module named 'mcp_schema'
Both fixed   POST /apps  200 in 1.9 s, then the agent lists the tools and
             calls get_directory_tree over the MCP gateway`}</pre>
        <p className="mt-2 text-sm text-neutral-600">With the patch, the agent connected and used your filesystem tools. My local text-only model (gpt-oss-20b) then failed on its own output format at final_answer. This task needs a vision model to read the images, and I had none, so I have no graded score on this path.</p>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-normal">Try it</h2>
        <pre className="mt-4 overflow-x-auto bg-neutral-50 p-4 text-sm leading-6">{`python3 close_check.py setup      # 21 s here, empty folder to ready
python3 close_check.py run --agent 'claude -p --model sonnet --allowedTools Bash,Read,Glob,Grep'
python3 close_check.py grade --judge claude:haiku
python3 close_check.py check-judge --judge claude:haiku`}</pre>
        <p className="mt-3 text-sm text-neutral-700">
          The agent is any command that reads the prompt on stdin and prints its answer. The judge is any LiteLLM model id, or <code>claude:&lt;model&gt;</code> for no API key. It needs Python 3 and uv.
        </p>
      </section>

      <section id="report" className="mt-14 scroll-mt-6">
        <h2 className="text-2xl font-normal">A real report: Claude Code on the month-end close</h2>
        <p className="mt-3 text-neutral-800">
          Sonnet, two blind runs per task, no golden answers in the folder: {totalMet} of {totalCriteria} criteria met. Every answer and verdict below is recorded output.
        </p>
        <p className="mt-2 text-sm text-neutral-600">Task 26 scored 0 of 3 on both runs. The agent computed far larger performance compensation than the rubric expects ($254K to $408K vs $227,257.06). That is an agent error, not a grader bug.</p>
        <p className="mt-2 text-sm text-neutral-600">Practice only. This is not an APEX-Accounting score: no MCP world or QuickBooks interface, and a stand-in judge (Haiku).</p>
        <div className="mt-6"><Explorer index={data.index} /></div>
      </section>

      <section id="stress" className="mt-14 scroll-mt-6">
        <h2 className="text-2xl font-normal">One more thing: the hedging guard ships off</h2>
        <p className="mt-3 text-neutral-800">
          Your methodology page says the judge penalizes hedging, but <code className="text-sm">scattergunning_guard</code> is off in all 10 public task configs. Answers that keep the right figure but add &quot;or possibly $X&quot; got credit for {frac(s.hedge.sonnet.off)} criteria with a Sonnet judge, and {frac(s.hedge.sonnet.on)} with the flag on. Expert answers stayed at {frac(s.golden.sonnet.on)}. Wrong digits ({frac(s.sonnet.wrongDigit)}) and swapped amounts ({frac(s.sonnet.swap)}) were caught.
        </p>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">Limits</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-neutral-800">
            <li>This says nothing about published scores, because the leaderboard uses an unreleased judge template. It was not run on gemini-3-flash-preview. Haiku credited {frac(s.hedge.haiku.off)} hedges. The flag did not stop gpt-oss-20b, which credited {s.gptoss.on} of {s.gptoss.pairs}.</li>
            <li>The hedged answers are built from the expert answer. Honest Claude Code runs rarely hedged: 2 verdicts flipped across 80 gradings.</li>
            <li>ApexAgents-SkyRL-Recipe uses these scores as reward with the grader pinned at 79668ba, which has no guard code. Sonnet credited {frac(s.hedge.sonnet.pinned)} hedges through it.</li>
          </ul>
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
