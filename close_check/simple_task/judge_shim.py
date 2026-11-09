#!/usr/bin/env python3
"""OpenAI-compatible /chat/completions shim that answers with `claude -p`, so Archipelago's grading runner runs unmodified with no API key.
Disclosure: this is not Mercor's judge (packaged default: vertex_ai/gemini-3-flash-preview). usage: judge_shim.py <port> <claude-model>"""
import json, subprocess, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
MODEL = sys.argv[2]
def text(c):
    return c if isinstance(c,str) else ''.join(p.get('text','') for p in (c or []) if isinstance(p,dict))
class H(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_POST(self):
        b=json.loads(self.rfile.read(int(self.headers['content-length'])))
        sys_p='\n'.join(text(m['content']) for m in b['messages'] if m['role']=='system')
        usr='\n\n'.join(text(m['content']) for m in b['messages'] if m['role']!='system')
        rf=b.get('response_format') or {}
        schema=(rf.get('json_schema') or {}).get('schema')
        hint='\n\nRespond with only a JSON object'+(' matching this schema: '+json.dumps(schema) if schema else ' with keys rationale (string) and is_criteria_true (boolean)')+'. No code fence.'
        r=subprocess.run(['claude','-p','--model',MODEL,'--setting-sources','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--tools','','--system-prompt',sys_p+hint],
            input=usr,capture_output=True,text=True,cwd='/tmp',timeout=280)
        out=r.stdout.strip()
        if out.startswith('```'): out=out.split('\n',1)[1].rsplit('```',1)[0].strip()
        msg={'role':'assistant','content':out}
        if b.get('stream'):
            self.send_response(200);self.send_header('content-type','text/event-stream');self.end_headers()
            ch={'id':'c','object':'chat.completion.chunk','created':int(time.time()),'model':b['model'],'choices':[{'index':0,'delta':msg,'finish_reason':'stop'}]}
            self.wfile.write(('data: '+json.dumps(ch)+'\n\ndata: [DONE]\n\n').encode());return
        res=json.dumps({'id':'c','object':'chat.completion','created':int(time.time()),'model':b['model'],'choices':[{'index':0,'message':msg,'finish_reason':'stop'}],'usage':{'prompt_tokens':1,'completion_tokens':1,'total_tokens':2}}).encode()
        self.send_response(200);self.send_header('content-type','application/json');self.send_header('content-length',str(len(res)));self.end_headers();self.wfile.write(res)
ThreadingHTTPServer(('127.0.0.1',int(sys.argv[1])),H).serve_forever()
