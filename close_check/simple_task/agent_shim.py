#!/usr/bin/env python3
"""OpenAI-compatible /chat/completions shim with tool calls and images, answered by `claude -p`.
Lets Archipelago's unmodified agent runner (litellm_proxy) drive a real vision model with no API key.
Images (image_url data URIs, in any message) are passed to Claude as image content blocks.
Disclosure: not Mercor's configured model (vertex_ai/gemini-3.1-pro-preview). Requests whose model name contains "judge" are forwarded to judge_shim.py.
usage: agent_shim.py <port> <claude-model> <log.jsonl> [judge-port]"""
import json, subprocess, sys, time, urllib.request, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT, MODEL, LOG = int(sys.argv[1]), sys.argv[2], sys.argv[3]
JUDGE_PORT = int(sys.argv[4]) if len(sys.argv) > 4 else 4002
PROTOCOL = (
    "\n\nYou are the model behind an OpenAI-style chat API with function calling. The conversation and the "
    "available functions follow. Decide your next assistant turn. Respond with ONLY one JSON object, no code fence: "
    '{"content": "<text for this turn, may be empty>", "tool_calls": [{"name": "<function>", "arguments": {...}}]}. '
    "Use an empty tool_calls list when you are not calling a function. Arguments must match the function's JSON schema."
)


def blocks(content):
    """OpenAI message content -> Anthropic content blocks (text + base64 images)."""
    if isinstance(content, str) or content is None:
        return [{"type": "text", "text": content or ""}]
    out = []
    for p in content:
        if p.get("type") == "text":
            out.append({"type": "text", "text": p["text"]})
        elif p.get("type") == "image_url":
            url = p["image_url"]["url"] if isinstance(p["image_url"], dict) else p["image_url"]
            head, data = url.split(",", 1)
            out.append({"type": "image", "source": {"type": "base64", "media_type": head[5:].split(";")[0], "data": data}})
    return out


def transcript(messages, tools):
    parts = [{"type": "text", "text": "FUNCTIONS:\n" + json.dumps([t["function"] for t in tools or []])}]
    for m in messages:
        if m["role"] == "system":
            continue
        label = m["role"].upper() + (f" (result of call {m.get('tool_call_id')})" if m["role"] == "tool" else "")
        parts.append({"type": "text", "text": f"\n--- {label} ---"})
        parts += blocks(m.get("content"))
        for tc in m.get("tool_calls") or []:
            parts.append({"type": "text", "text": f"[called {tc['function']['name']}({tc['function']['arguments']}) id={tc['id']}]"})
    parts.append({"type": "text", "text": "\n--- your next ASSISTANT turn (JSON only) ---"})
    return parts


def ask(b):
    system = "\n".join(c["text"] for m in b["messages"] if m["role"] == "system" for c in blocks(m["content"]) if c["type"] == "text")
    msg = {"type": "user", "message": {"role": "user", "content": transcript(b["messages"], b.get("tools"))}}
    r = subprocess.run(
        ["claude", "-p", "--model", MODEL, "--setting-sources", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
         "--tools", "", "--system-prompt", system + PROTOCOL, "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"],
        input=json.dumps(msg) + "\n", capture_output=True, text=True, cwd="/tmp", timeout=280)
    result = next(json.loads(l) for l in reversed(r.stdout.splitlines()) if l.strip() and json.loads(l).get("type") == "result")
    out = result["result"].strip()
    if out.startswith("```"):
        out = out.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(out[out.index("{"): out.rindex("}") + 1])


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):  # litellm health / model list probes
        self.reply({"data": [{"id": MODEL, "object": "model"}]})

    def reply(self, obj):
        res = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(res)))
        self.end_headers()
        self.wfile.write(res)

    def do_POST(self):
        raw = self.rfile.read(int(self.headers["content-length"]))
        b = json.loads(raw)
        if "judge" in b["model"]:  # grader calls go to judge_shim.py on JUDGE_PORT, unchanged
            r = urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{JUDGE_PORT}{self.path}", raw, {"content-type": "application/json"}), timeout=300)
            body = r.read()
            self.send_response(200)
            self.send_header("content-type", r.headers.get("content-type", "application/json"))
            self.end_headers()
            self.wfile.write(body)
            return
        a = ask(b)
        calls = [{"id": "call_" + uuid.uuid4().hex[:12], "type": "function",
                  "function": {"name": c["name"], "arguments": json.dumps(c.get("arguments") or {})}} for c in a.get("tool_calls") or []]
        msg = {"role": "assistant", "content": a.get("content") or ""}
        if calls:
            msg["tool_calls"] = calls
        n_img = sum(1 for m in b["messages"] if isinstance(m.get("content"), list) for p in m["content"] if p.get("type") == "image_url")
        with open(LOG, "a") as f:
            f.write(json.dumps({"t": time.time(), "model": MODEL, "n_messages": len(b["messages"]), "images_in": n_img, "reply": msg}) + "\n")
        fr = "tool_calls" if calls else "stop"
        if b.get("stream"):
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.end_headers()
            delta = dict(msg)
            if calls:
                delta["tool_calls"] = [dict(c, index=i) for i, c in enumerate(calls)]
            ch = {"id": "c", "object": "chat.completion.chunk", "created": int(time.time()), "model": b["model"],
                  "choices": [{"index": 0, "delta": delta, "finish_reason": fr}]}
            self.wfile.write(("data: " + json.dumps(ch) + "\n\ndata: [DONE]\n\n").encode())
            return
        self.reply({"id": "c", "object": "chat.completion", "created": int(time.time()), "model": b["model"],
                    "choices": [{"index": 0, "message": msg, "finish_reason": fr}],
                    "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}})


ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
