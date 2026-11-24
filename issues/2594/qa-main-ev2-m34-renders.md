# M34 round 2: Forgejo and Azure Repos rendering

## Forgejo (Codeberg) kodus/claude-athena#2, comment 28438009
Raw body equals `USER_NO_LICENSE_NOTICE`. Codeberg's own renderer (`POST /api/v1/markdown`, mode `comment`, context `kodus/claude-athena`) on that exact body returns (marker removed, nothing visible):
```html
<h2 id="user-content-kodus-license-not-found" dir="auto">Kodus license not found</h2>
<p dir="auto">Kody skipped this review because the PR author has no Kodus license assigned. Ask your Kodus admin to assign you a license.</p>
```

## Azure Repos Kodus QA/claude-athena!208, thread 1352 comment 1
Raw content (threads API) equals `USER_NO_LICENSE_NOTICE`, including the trailing `<!-- kody-codereview -->`. Rendering NOT checked: Azure DevOps has no public markdown-render API, the PAT cannot open a web session (dev.azure.com web requires an Entra/Microsoft login), and anonymous access answers 404. The same marker string already ends Kody's pre-existing review comments on the same PR (thread 1362 "Code Review Completed", thread 1363 badge), so any visibility on Azure would not be specific to this notice.

## Provider page captures
Not possible on any provider: all `claude-*` repositories are private and the QA credentials are API tokens only (GitHub, GitLab, Bitbucket app password, Codeberg token, Azure PAT); none opens a browser session. Codeberg `/pulls/2` answers "Page not found" anonymously.
