# SKBaseAI — Claude Guidelines

## Git Workflow
- **Never push directly to `main`.** Always branch → PR → merge via GitHub.
  No exceptions, including debug commits.
- Branch naming: `<username>/<short-description>`
- Commit messages: imperative subject line + body if needed.
  Always append: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

## Environment Variables
- **Never commit `.env` files or secrets.** Root `.env` is gitignored — keep it that way.
- **Never hardcode secrets or service URLs** that belong in environment variables.
- When adding a new env var: update `.env.example`, the Railway/Vercel dashboard,
  and `.claude/skills/deployment/SKILL.md`.

## Linting — Run Before Every PR

### Backend (apps/api)
```bash
ruff check . && ruff format --check .
```

### Frontend (apps/web)
```bash
npm run lint && npx tsc --noEmit
```

Both must pass cleanly. CI enforces this, but run locally first.

## Deployment
- **Never use `railway up`** against the production service. It bypasses GitHub
  integration, creates untracked deployments, and may not pick up env vars correctly.
- **Deploy by merging to `main`.** Railway auto-deploys from `main` via GitHub
  integration. Vercel deploys automatically on push.
- To force a redeploy without a code change: Railway dashboard → Deployments → Redeploy.

## Docs / Skills
- When adding or changing a feature, update the relevant file in `.claude/skills/`
  if it affects architecture, env vars, or deployment.
- When adding a new env var to Railway or Vercel, update
  `.claude/skills/deployment/SKILL.md` env var tables in the same PR.
