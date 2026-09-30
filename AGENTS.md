# Repository instructions for coding agents

This is an open-source poker application. Preserve existing user prompts,
variable paths, saved browser data, and mobile behavior unless the task
explicitly requests a breaking change.

## Variable and algorithm work

Before creating or changing any prompt variable, formula, poker analysis, or
algorithm plugin, read and follow [`plugins/AGENTS.md`](plugins/AGENTS.md) in
full. It is the authoritative contribution workflow for variables.

Do not add variable-specific UI code. A correctly registered plugin supplies
field metadata to the shared catalog, and the existing UI discovers it.

## Required verification

For variable-plugin changes run:

```bash
npm run test:variables
npx tsc --noEmit
npm run build
```

Do not commit generated `dist/` or `.tournament/` output.
