# Agent Instructions

- Do not run `pnpm install`, `pnpm add`, `pnpm remove`, `pnpm upgrade`, or any other pnpm command that can change `pnpm-lock.yaml`.
- Do not refresh, regenerate, or otherwise modify `pnpm-lock.yaml` unless the user explicitly asks for that lockfile change.
- If you need to add/remove dependencies, modify the `package.json` file and continue with the next steps. The user will handle the lockfile changes.