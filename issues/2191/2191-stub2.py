# Audit stub for #2191: POST whose body carries the security agent's mission -> 402 Insufficient balance;
# every other POST is forwarded to Fireworks with the key read locally (QA only ever sends a fake key here).
# GET /models -> 200. Logs method, path, status, size, body hash, model, routed-to (never headers or keys).
import hashlib, json, os, sys, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
LOG = sys.argv[2]; KEY = os.environ.pop('QA_UPSTREAM_KEY'); UP = 'https://api.fireworks.ai/inference/v1'
MARK = b'Find real, verifiable security vulnerabilities'
class H(BaseHTTPRequestHandler):
    def _log(self, status, body, routed):
        try: model = json.loads(body or b'{}').get('model')
        except Exception: model = None
        rec = {'ts': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime()) + '.%03dZ' % (int(time.time()*1000) % 1000), 'method': self.command,
               'path': self.path, 'status': status, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()[:16] if body else None,
               'model': model, 'routed': routed, 'security_marker': MARK in body}
        with open(LOG, 'a') as f: f.write(json.dumps(rec) + '\n')
    def _send(self, status, data, ctype='application/json'):
        self.send_response(status); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        if self.path.rstrip('/').endswith('/models'):
            self._log(200, b'', 'local'); return self._send(200, json.dumps({'object': 'list', 'data': [{'id': 'accounts/fireworks/models/deepseek-v4p1-flash', 'object': 'model'}]}).encode())
        self._log(404, b'', 'local'); self._send(404, b'{}')
    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0); body = self.rfile.read(n) if n else b''
        if MARK in body:
            self._log(402, body, 'stub-402')
            return self._send(402, json.dumps({'error': {'message': 'Insufficient balance', 'type': 'insufficient_quota', 'code': 'insufficient_balance'}}).encode())
        sub = self.path.split('/v1', 1)[1] if '/v1' in self.path else self.path
        req = urllib.request.Request(UP + sub, data=body, method='POST', headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY, 'Accept': self.headers.get('Accept', 'application/json')})
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                data = r.read(); st = r.status; ct = r.headers.get('Content-Type', 'application/json')
        except urllib.error.HTTPError as e:
            data = e.read(); st = e.code; ct = e.headers.get('Content-Type', 'application/json')
        except Exception as e:
            data = json.dumps({'error': {'message': 'upstream error'}}).encode(); st = 502; ct = 'application/json'
        self._log(st, body, 'fireworks'); self._send(st, data, ct)
    def log_message(self, *a): pass
ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
