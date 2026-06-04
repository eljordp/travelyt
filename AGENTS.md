<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Travelyt source-of-truth guard

This folder is the canonical Travelyt production app:

- Local path: `/Users/jp/projects/travelyt`
- Git origin: `https://github.com/eljordp/travelyt.git`
- Vercel project: `travelyt`
- Production domain: `https://travelyt.us`

Do not confuse it with:

- `/Users/jp/Documents/New project` — JP AI Brain workspace, not Travelyt and not deploy-linked.
- `/Users/jp/projects/travelyt-launch-complete` — older launch snapshot/worktree, not the active source for production changes.

Before deploying Travelyt, confirm `pwd` is `/Users/jp/projects/travelyt` and `.vercel/project.json` has `"projectName":"travelyt"`.
