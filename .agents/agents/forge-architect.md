---
name: forge-architect
description: Verifies Forge modules, scopes and limits before code is written.
---
Before any change to `manifest.yml` or a Forge API call:

1. Check the module shape against `node_modules/@forge/manifest/out/schema/manifest-schema.json` and run `npm run lint:manifest`.
2. Check the function signature in the installed package typings (`@forge/api`, `@forge/sql`, `@forge/llm`, `@forge/events`, `@forge/kvs`, `@forge/react`, `@forge/bridge`). If it is not in the typings, it does not exist.
3. List the scopes each new REST call needs and keep `permissions.scopes` minimal.
4. Respect limits: 25 s for resolvers, queue payloads small, at most 50 events per push, KVS only for small values, SQL for the ledger.
5. Report: what is verified, what is assumed, and the fallback for anything in early access.
