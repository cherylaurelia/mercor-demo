"use client";

import { useState } from "react";

type RunSummary = { rep: number; met: number; total: number };

export type IndexRow = { id: string; category: string; runs: RunSummary[] };

type Verdict = { i: number; met: boolean; why: string };

type Run = { rep: number; turns: number; seconds: number; answer: string; met: Verdict[] };

type Task = { id: string; category: string; prompt: string; criteria: string[]; runs: Run[] };

const loaders = new Map<string, () => Promise<{ default: Task }>>([
  ["4", () => import("../data/tasks/4.json")],
  ["5", () => import("../data/tasks/5.json")],
  ["6", () => import("../data/tasks/6.json")],
  ["7", () => import("../data/tasks/7.json")],
  ["13", () => import("../data/tasks/13.json")],
  ["14", () => import("../data/tasks/14.json")],
  ["17", () => import("../data/tasks/17.json")],
  ["23", () => import("../data/tasks/23.json")],
  ["26", () => import("../data/tasks/26.json")],
  ["30", () => import("../data/tasks/30.json")],
]);

export function Explorer({ index }: { index: IndexRow[] }) {
  const [task, setTask] = useState<Task | null>(null);
  const [rep, setRep] = useState(1);
  const [failed, setFailed] = useState(false);

  async function open(id: string, nextRep: number) {
    setRep(nextRep);
    setFailed(false);

    if (task?.id === id) return;

    try {
      const load = loaders.get(id);

      if (load) setTask((await load()).default);
    } catch {
      setFailed(true);
    }
  }

  const run = task?.runs.find((r) => r.rep === rep);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200">
              <th scope="col" className="py-2 pr-4 font-medium">Task</th>
              <th scope="col" className="hidden py-2 pr-4 font-medium sm:table-cell">Type</th>
              <th scope="col" className="py-2 pr-4 font-medium">Run 1</th>
              <th scope="col" className="py-2 font-medium">Run 2</th>
            </tr>
          </thead>
          <tbody>
            {index.map((row) => (
              <tr key={row.id} className={`border-b border-neutral-100 ${task?.id === row.id ? "bg-neutral-50" : ""}`}>
                <td className="py-2 pr-4 whitespace-nowrap">Task {row.id}</td>
                <td className="hidden py-2 pr-4 whitespace-nowrap text-neutral-600 sm:table-cell">{row.category}</td>
                {row.runs.map((r) => (
                  <td key={r.rep} className="py-1 pr-4">
                    <button
                      type="button"
                      onClick={() => open(row.id, r.rep)}
                      aria-pressed={task?.id === row.id && rep === r.rep}
                      className={`rounded border px-2 py-1 tabular-nums whitespace-nowrap hover:border-black ${task?.id === row.id && rep === r.rep ? "border-black" : "border-neutral-300"}`}
                    >
                      {r.met} of {r.total}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {failed ? <p className="mt-6 text-sm">That run could not be loaded. Refresh and try again.</p> : null}
      {!task && !failed ? <p className="mt-4 text-sm text-neutral-600">Pick a score to read the prompt, the agent&apos;s answer and each judge verdict.</p> : null}

      {task && run ? (
        <div className="mt-8 space-y-6">
          <div>
            <h3 className="text-sm font-medium">Prompt, task {task.id}</h3>
            <p className="mt-2 text-sm whitespace-pre-wrap text-neutral-700">{task.prompt}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium">Judge verdicts, run {run.rep}</h3>
            <ul className="mt-2 divide-y divide-neutral-100 border-y border-neutral-100">
              {run.met.map((v) => (
                <li key={v.i}>
                  <details className="py-2 text-sm">
                    <summary className="cursor-pointer">
                      <span className={`mr-2 font-medium ${v.met ? "text-black" : "text-red-700"}`}>{v.met ? "Met" : "Not met"}</span>
                      {task.criteria[v.i]}
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-neutral-600">{v.why}</p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Agent&apos;s full answer ({run.turns} turns, {run.seconds}s)</summary>
            <pre className="mt-2 max-h-96 overflow-auto bg-neutral-50 p-4 text-xs whitespace-pre-wrap">{run.answer}</pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}
