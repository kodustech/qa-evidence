# OpenAI-compatible stub for #2191 QA: POST -> 402 Insufficient balance (or 503/401 by path prefix), GET /models -> 200.
# Logs method, path, body hash/size, model and whether an Authorization header was present (never its value).
import hashlib, json, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
LOG = sys.argv[2]
MODES = {'q': (402, {'error': {'message': 'Insufficient balance', 'type': 'insufficient_quota', 'code': 'insufficient_balance'}}),
         'e503': (503, {'error': {'message': 'Service temporarily unavailable', 'type': 'server_error'}}),
         'e401': (401, {'error': {'message': 'Incorrect API key provided', 'type': 'invalid_request_error', 'code': 'invalid_api_key'}})}
class H(BaseHTTPRequestHandler):
    def _log(self, status, body=b''):
        try: model = json.loads(body or b'{}').get('model')
        except Exception: model = None
        rec = {'ts': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime()) + '.%03dZ' % (int(time.time()*1000) % 1000),
               'method': self.command, 'path': self.path, 'status': status, 'bytes': len(body),
               'sha256': hashlib.sha256(body).hexdigest()[:16] if body else None, 'model': model,
               'auth_header': bool(self.headers.get('Authorization'))}
        with open(LOG, 'a') as f: f.write(json.dumps(rec) + '\n')
    def _send(self, status, obj):
        b = json.dumps(obj).encode()
        self.send_response(status); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def _mode(self):
        seg = self.path.strip('/').split('/')[0]
        return MODES.get(seg, MODES['q'])
    def do_GET(self):
        if self.path.rstrip('/').endswith('/models'):
            self._log(200); return self._send(200, {'object': 'list', 'data': [{'id': 'qa2191-quota-model', 'object': 'model', 'owned_by': 'qa'}]})
        self._log(404); self._send(404, {'error': {'message': 'not found'}})
    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0); body = self.rfile.read(n) if n else b''
        st, obj = self._mode(); self._log(st, body); self._send(st, obj)
    def log_message(self, *a): pass
ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
