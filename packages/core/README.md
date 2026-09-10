# @heo/core

The framework-neutral transformation engine.

`@heo/core` takes an HTML string and returns an HTML string. It must not know
about Express, Fastify, Next.js, Flask, or any other host framework — every
integration is an adapter that reduces to:

```ts
const result = transformHtml(html, config);
```

## Pipeline

| Stage | Directory     | Responsibility                                         |
| ----- | ------------- | ------------------------------------------------------ |
| 2     | `parser/`     | Parse the document, discover `[data-heo]` regions      |
| 3     | `selector/`   | Tokenize text and select semantically valuable spans   |
| 4     | `planner/`    | Assign a representation strategy per span (seeded)     |
| 5     | `renderers/`  | Realize each strategy as DOM                           |
| 5     | `decoys/`     | Generate plausible replacement text                    |
| 5     | `chaff/`      | Generate low-cost noise nodes                          |
| 6     | `assembler/`  | Reassemble the document and emit runtime assets        |

See [SPEC.md](../../SPEC.md) sections 9–22 for the authoritative definitions.
