# QA API/DB/log outputs, #2570 (slot a)

### qa-org2-api.txt
```
window start 2026-11-24T20:56:13.000Z
M5 dc-missing (404): HTTP 400 0.6s body={"statusCode": 400, "timestamp": "2026-11-24T20:56:16.165Z", "path": "/code-management/auth-integration", "error": "Bad Request", "message": "Error authenticating with Bitbucket Data Center."} | pwInBody=False
M6 dc-html (200 HTML): HTTP 400 0.61s body={"statusCode": 400, "timestamp": "2026-11-24T20:56:17.283Z", "path": "/code-management/auth-integration", "error": "Bad Request", "message": "Error authenticating with Bitbucket Data Center."} | pwInBody=False
M7 Cloud Basic, no host: HTTP 400 0.57s body={"statusCode": 400, "timestamp": "2026-11-24T20:56:18.355Z", "path": "/code-management/auth-integration", "error": "Bad Request", "message": "Bitbucket Cloud authenticates with a token, not a username and password"} | pwInBody=False
M7 Cloud token mode, no token: HTTP 400 0.55s body={"statusCode": 400, "timestamp": "2026-11-24T20:56:19.413Z", "path": "/code-management/auth-integration", "error": "Bad Request", "message": "A token is required to connect Bitbucket Cloud"} | pwInBody=False
M7 Cloud token mode, token "": HTTP 400 0.56s body={"statusCode": 400, "timestamp": "2026-11-24T20:56:20.476Z", "path": "/code-management/auth-integration", "error": "Bad Request", "message": "A token is required to connect Bitbucket Cloud"} | pwInBody=False
M7 absent mode: HTTP 400 0.57s body={"statusCode": 400, "timestamp": "2026-11-24T20:56:21.554Z", "path": "/code-management/auth-integration", "error": "Bad Request", "message": "Authenticating on Bitbucket via OAuth not implemented"} | pwInBody=False
M7 oauth: HTTP 400 0.55s body={"statusCode": 400, "timestamp": "2026-11-24T20:56:22.609Z", "path": "/code-management/auth-integration", "error": "Bad Request", "message": "Authenticating on Bitbucket via OAuth not implemented"} | pwInBody=False
M7 unknown mode: HTTP 400 0.56s body={"statusCode": 400, "timestamp": "2026-11-24T20:56:23.672Z", "path": "/code-management/auth-integration", "error": "Bad Request", "message": "A token is required to connect Bitbucket Cloud"} | pwInBody=False
M20 whitespace-only host: HTTP 400 0.56s body={"statusCode": 400, "timestamp": "2026-11-24T20:56:24.737Z", "path": "/code-management/auth-integration", "error": "Bad Request", "message": "Bitbucket Cloud authenticates with a token, not a username and password"} | pwInBody=False
M20 host without scheme: HTTP 400 0.57s body={"statusCode": 400, "timestamp": "2026-11-24T20:56:25.795Z", "path": "/code-management/auth-integration", "error": "Bad Request", "message": "Error authenticating with Bitbucket Data Center."} | pwInBody=False
M20 host with /rest/api/1.0 appended: HTTP 400 0.81s body={"statusCode": 400, "timestamp": "2026-11-24T20:56:27.126Z", "path": "/code-management/auth-integration", "error": "Bad Request", "message": "Error authenticating with Bitbucket Data Center."} | pwInBody=False
M21 host number (QA): HTTP 500 0.55s body={"statusCode": 500, "timestamp": "2026-11-24T20:56:28.182Z", "path": "/code-management/auth-integration", "error": "Internal Server Error", "message": "An unexpected error occurred"} | pwInBody=False
rows after: []

```

### qa-org2-api-logs.txt
```
{"t": "2026-11-24T20:56:16.164Z", "level": "error", "component": "BitbucketDataCenterService", "host": "https://kodustech.github.io/qa-evidence/issues/2570/dc-missing", "message": "Error authenticating with Data Center token", "err": "Request failed with status code 404"}
{"t": "2026-11-24T20:56:17.281Z", "level": "error", "component": "BitbucketDataCenterService", "host": "https://kodustech.github.io/qa-evidence/issues/2570/dc-html", "message": "Error authenticating with Data Center token", "err": "Bitbucket Data Center failed to validate the provided token."}
{"t": "2026-11-24T20:56:18.353Z", "level": "error", "component": "BitbucketCloudService createAuthIntegration", "authMode": "basic", "host": null, "message": "Error to create auth integration", "err": "Bitbucket Cloud authenticates with a token, not a username and password"}
{"t": "2026-11-24T20:56:19.412Z", "level": "error", "component": "BitbucketCloudService createAuthIntegration", "authMode": "token", "host": null, "message": "Error to create auth integration", "err": "A token is required to connect Bitbucket Cloud"}
{"t": "2026-11-24T20:56:20.475Z", "level": "error", "component": "BitbucketCloudService createAuthIntegration", "authMode": "token", "host": null, "message": "Error to create auth integration", "err": "A token is required to connect Bitbucket Cloud"}
{"t": "2026-11-24T20:56:21.553Z", "level": "error", "component": "BitbucketCloudService createAuthIntegration", "authMode": "oauth", "host": null, "message": "Error to create auth integration", "err": "Authenticating on Bitbucket via OAuth not implemented"}
{"t": "2026-11-24T20:56:22.608Z", "level": "error", "component": "BitbucketCloudService createAuthIntegration", "authMode": "oauth", "host": null, "message": "Error to create auth integration", "err": "Authenticating on Bitbucket via OAuth not implemented"}
{"t": "2026-11-24T20:56:23.671Z", "level": "error", "component": "BitbucketCloudService createAuthIntegration", "authMode": "foo", "host": null, "message": "Error to create auth integration", "err": "A token is required to connect Bitbucket Cloud"}
{"t": "2026-11-24T20:56:24.736Z", "level": "error", "component": "BitbucketCloudService createAuthIntegration", "authMode": "basic", "host": "   ", "message": "Error to create auth integration", "err": "Bitbucket Cloud authenticates with a token, not a username and password"}
{"t": "2026-11-24T20:56:25.794Z", "level": "error", "component": "BitbucketDataCenterService", "host": "kodustech.github.io/qa-evidence/issues/2570/dc-ok", "message": "Error authenticating with Data Center token", "err": "Invalid URL"}
{"t": "2026-11-24T20:56:27.124Z", "level": "error", "component": "BitbucketDataCenterService", "host": "https://kodustech.github.io/qa-evidence/issues/2570/dc-ok/rest/api/1.0", "message": "Error authenticating with Data Center token", "err": "Request failed with status code 503"}

```

### m12-api.txt
```
API 400 30.59 s {"statusCode": 400, "timestamp": "2026-11-24T21:09:49.509Z", "path": "/code-management/auth-integration", "error": "Bad Request", "message": "Error authenticating with Bitbucket Data Center."}
rows []
log {"t": "2026-11-24T21:08:17.358Z", "level": "error", "component": "BitbucketDataCenterService", "host": "http://192.0.2.1", "message": "Error authenticating with Data Center token", "err": "timeout of 30000ms exceeded"}
log {"t": "2026-11-24T21:09:49.507Z", "level": "error", "component": "BitbucketDataCenterService", "host": "http://192.0.2.1", "message": "Error authenticating with Data Center token", "err": "timeout of 30000ms exceeded"}

```

### m17-m23-m20.txt
```
M17 Cloud->DC 201 0.6 {"data": {"success": true, "status": "SUCCESS"}, "statusCode": 201, "type": "Object"}
  before [['478f5b83-f467-41f1-92c3-d4b009979e04', '9811be87-28d9-4ea1-b5f3-cfa3017c7f67', '', 'token']]
  after  [['478f5b83-f467-41f1-92c3-d4b009979e04', '9811be87-28d9-4ea1-b5f3-cfa3017c7f67', 'https://kodustech.github.io/qa-evidence/issues/2570/dc-ok', 'basic']]
  repos/org after 200 ['qa2570-alpha', 'qa2570-beta']
  logs []
M23 dc-empty 201 {"data": {"success": true, "status": "SUCCESS"}, "statusCode": 201, "type": "Object"} | repos/org 200 {"data": [], "statusCode": 200, "type": "Array"} | rows [['https://kodustech.github.io/qa-evidence/issues/2570/dc-empty', 'basic']]
M20 trailing slash org 9 201 {"data": {"success": true, "status": "SUCCESS"}, "statusCode": 201, "type": "Object"} | stored host ["'https://kodustech.github.io/qa-evidence/issues/2570/dc-ok/'"] | repos/org 200 ['qa2570-alpha', 'qa2570-beta']
M20 surrounding spaces org 10 400 {"statusCode": 400, "timestamp": "2026-11-24T21:19:06.736Z", "path": "/code-management/auth-integrat | stored host [] | repos/org 200 []
[('BitbucketDataCenterService', 'Error authenticating with Data Center token', 'Request failed with status code 503', "'  https://kodustech.github.io/qa-evidence/issues/2570/dc-ok  '")]

```

### m24-connections.txt
```
1 200 [{"platformName": "BITBUCKET", "isSetupComplete": false, "hasConnection": true, "config": {"hasRepositories": false, "host": "https://kodustech.github.io/qa-evidence/issues/2570/dc-ok"}, "category": "CODE_MANAGEMENT"}]
2 200 []
3 200 [{"platformName": "BITBUCKET", "isSetupComplete": false, "hasConnection": true, "config": {"hasRepositories": false}, "category": "CODE_MANAGEMENT"}]
8 200 [{"platformName": "BITBUCKET", "isSetupComplete": false, "hasConnection": true, "config": {"hasRepositories": false, "host": "https://kodustech.github.io/qa-evidence/issues/2570/dc-ok"}, "category": "CODE_MANAGEMENT"}]

```

### m24-audit.txt
```
1 9aa6fade []
2 02e782b5 []
4 b823c687 []
8 a2fa6122 []
3 6d50fa54 []

```

### m16-qa-1.txt
```
{"pid": 34938, "sent": "21:20:26.767", "dt": 1.4, "status": 201, "body": {"success": true, "status": "SUCCESS"}}

```

### m16-qa-2.txt
```
{"pid": 34939, "sent": "21:20:26.767", "dt": 1.4, "status": 201, "body": {"success": true, "status": "SUCCESS"}}

```

### m16-qa-cloud-1.txt
```
{"pid": 35521, "sent": "21:20:46.662", "dt": 3.11, "status": 201, "body": {"success": true, "status": "SUCCESS"}}

```

### m16-qa-cloud-2.txt
```
{"pid": 35522, "sent": "21:20:46.662", "dt": 2.85, "status": 201, "body": {"success": true, "status": "SUCCESS"}}

```

### m26-qa.txt
```
{'docs': 69, 'pw': 0, 'b64': 0, 'basicHdr': 0, 'authKeys': 0, 'dcErr': 11, 'levels': ['error']}

```

### m27-qa.txt
```
before att [] vic []
unauthenticated -> 401 {"statusCode": 401, "timestamp": "2026-11-24T21:25:34.850Z", "path": "/code-management/auth-integration", "error": "Unauthorized", "message": "api.users.unautho
bad token -> 401 {"statusCode": 401, "timestamp": "2026-11-24T21:25:35.381Z", "path": "/code-management/auth-integration", "error": "Unauthorized", "message": "api.users.unautho
foreign team only (attacker org implicit) -> 404 {"statusCode": 404, "timestamp": "2026-11-24T21:25:35.931Z", "path": "/code-management/auth-integration", "error": "Not Found", "message": "Team not found"}
foreign org + foreign team in body -> 403 {"statusCode": 403, "timestamp": "2026-11-24T21:25:36.487Z", "path": "/code-management/auth-integration", "error": "Forbidden", "message": "organizationId does 
conflicting ids: attacker org + victim2 team -> 404 {"statusCode": 404, "timestamp": "2026-11-24T21:25:37.044Z", "path": "/code-management/auth-integration", "error": "Not Found", "message": "Team not found"}
after att [] 
vic [] 
vic2 [['a9b2e2b6', '7efb3fda', '', 'token']]
integrations by team [['ff15b305-0dce-4e81-a242-a2f2caad34f4', '3255eb1b-8860-410c-945b-a443af1baa35']]

```

### m8-m18-db.txt
```
3 repos/org 200 23 True True
3 rows [['478f5b83-f467-41f1-92c3-d4b009979e04', 't', 'BITBUCKET', '9811be87-28d9-4ea1-b5f3-cfa3017c7f67', 't', '', 'token', 'f', 't', '2026-11-24 21:13:20.532', '2026-11-24 21:13:20.527']]
3 DC logs [] bitbucket error logs []
3 selected configs [['0']]
5 repos/org 200 23 True True
5 rows [['a9b2e2b6-30ce-49ba-927a-e057717ba1c9', 't', 'BITBUCKET', '7efb3fda-5b58-43f4-ba38-424542f584db', 't', '', 'token', 'f', 't', '2026-11-24 21:13:21.739', '2026-11-24 21:13:21.735']]
5 DC logs [] bitbucket error logs []
5 selected configs [['0']]

```
