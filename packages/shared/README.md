# Shared contracts

Framework-independent, JSON-friendly contracts shared by control-plane boundaries. The package exposes its supported API only from `@otshop/shared`; consumers should not import source modules directly.

TypeScript types are inferred from Zod runtime schemas. Worker-facing schemas are deterministically emitted as Draft 2020-12 JSON Schema in `schema/contracts.schema.json`. This keeps one authoritative definition path:

```text
TypeScript/Zod -> JSON Schema -> future Python/Pydantic models and contract tests
```

Generate the committed artifact after an intentional contract change:

```powershell
pnpm schema:generate
```

Check for drift without modifying files:

```powershell
pnpm schema:check
```

The normal `pnpm test` suite also performs the drift check. Python/Pydantic generation and worker networking are intentionally deferred; no runtime contract contains `Date`, `BigInt`, `Map`, or `Set` values.
