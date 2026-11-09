import data from "../data/summary.json";
import { Explorer } from "./explorer";

const REPO = "https://github.com/cherylaurelia/mercor-demo";
const s = data.summary;
const frac = (v: number[]) => `${v[0]} of ${v[1]}`;
const totalMet = data.index.flatMap((t) => t.runs).reduce((sum, r) => sum + r.met, 0);
const totalCriteria = data.index.flatMap((t) => t.runs).reduce((sum, r) => sum + r.total, 0);

const rows = [
  { name: "Expert's own answer (control)", want: "all met", haiku: s.haiku.golden, sonnet: s.sonnet.golden, held: true },
  { name: "Blank answer (control)", want: "none met", haiku: s.haiku.blank, sonnet: s.sonnet.blank, held: true },
  { name: "One wrong digit in an amount", want: "none met", haiku: s.haiku.wrongDigit, sonnet: s.sonnet.wrongDigit, held: true },
  { name: "Two line items trade amounts", want: "none met", haiku: s.haiku.swap, sonnet: s.sonnet.swap, held: true },
  { name: "Right amount plus a hedged alternative", want: "none met", haiku: s.hedge.haiku.off, sonnet: s.hedge.sonnet.off, held: false },
];

export default function Page() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
      <p className="text-sm text-neutral-600">Built on APEX-Accounting and Archipelago</p>
      <h1 className="mt-3 text-4xl font-normal tracking-tight sm:text-5xl">Practice on the open APEX-Accounting tasks with the real grader, no Docker</h1>
      <p className="mt-6 text-lg text-neutral-800">
        On today's main, the Archipelago quick start builds a 17 GB image, then stops at a 503 after 5 minutes.
      </p>
      <p className="mt-2 text-lg text-neutral-800">
        close-check gives any agent the 10 open tasks as files in a plain folder, not your MCP world, so it changes the task. Your unmodified grader then returns a verdict for every criterion.
      </p>
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <a href={REPO} className="rounded bg-black px-4 py-2 text-white">View the repo</a>
        <a href="#report" className="rounded border border-neutral-300 px-4 py-2">Read a real report</a>
        <a href="#stress" className="rounded border border-neutral-300 px-4 py-2">Grader stress test</a>
      </div>

      <section className="mt-14">
        <h2 className="text-2xl font-normal">What stops people today</h2>
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
        <p className="mt-2 text-sm text-neutral-600">Task 26 scored 0 of 3 on both runs because the agent applied the per-matter cap per partner, which your own review notes call the trap. It is not a grader bug.</p>
        <p className="mt-2 text-sm text-neutral-600">Practice only. This is not an APEX-Accounting score: no MCP world or QuickBooks interface, and a stand-in judge (Haiku).</p>
        <div className="mt-6"><Explorer index={data.index} /></div>
      </section>

      <section id="stress" className="mt-14 scroll-mt-6">
        <h2 className="text-2xl font-normal">Secondary: a grader stress test</h2>
        <p className="mt-3 text-neutral-800">
          <code className="text-sm">SCATTERGUNNING_GUARD</code> exists, but it ships off in all 10 public tasks, even though your methodology page says the judge penalizes hedging. I gave the judge doctored versions of the expert answers: it held against two of three attacks on both judges, and hedging got through. The leaderboard uses an unreleased judge template, so this says nothing about published scores.</p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200">
                <th scope="col" className="py-2 pr-4 font-medium">Answer given to the judge</th>
                <th scope="col" className="hidden py-2 pr-4 font-medium sm:table-cell">Should be</th>
                <th scope="col" className="py-2 font-medium">Criteria met</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-neutral-100">
                  <td className={`py-2 pr-4 ${r.held ? "" : "font-medium text-red-700"}`}>{r.name}</td>
                  <td className="hidden py-2 pr-4 whitespace-nowrap text-neutral-600 sm:table-cell">{r.want}</td>
                  <td className="py-2 tabular-nums"><span className="whitespace-nowrap">Haiku {frac(r.haiku)}</span> <span className="whitespace-nowrap">· Sonnet {frac(r.sonnet)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-neutral-800">
          With <code className="text-sm">{`"scattergunning_guard": true`}</code>, Sonnet credited {frac(s.hedge.sonnet.on)} hedged figures, and the expert answers still went {frac(s.golden.sonnet.on)}. The flag is not judge-proof: local gpt-oss-20b credited {s.gptoss.on} of {s.gptoss.pairs} with it on.
        </p>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium">Limits, the one real case, and why it might matter for RL</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-neutral-800">
            <li>The hedged answers are built from the expert answer. Honest Claude Code runs didn&apos;t hedge: 2 verdicts flipped with the guard across 80 gradings.</li>
            <li>One real case was task 30, a run told to list candidate figures. Its primary table said 12.25% and an alternative table said 10.85%. As shipped, that was met. With the guard on, it was not met: &quot;Presenting several candidate bucket values... is hedging.&quot;</li>
            <li>Not run on your default judge, gemini-3-flash-preview, because I have no Google key. Run <code>check-judge --judge &lt;yours&gt;</code> first.</li>
            <li>ApexAgents-SkyRL-Recipe uses these scores as reward and pins the grader at 79668ba, which has no guard code. Through that commit, Sonnet credited {frac(s.hedge.sonnet.pinned)} hedged figures. Whether trained policies hedge is unknown, because those traces are gated.</li>
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
