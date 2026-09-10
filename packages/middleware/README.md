# @heo/middleware

Generic Node HTTP middleware that buffers an outgoing HTML response, hands it to
`@heo/core`, and writes the transformed result back.

```ts
import { heoMiddleware } from "@heo/middleware";

app.use(heoMiddleware({ mode: "balanced" }));
```

Responsibilities, in order (SPEC.md section 28):

1. inspect the response content type;
2. buffer the HTML body;
3. invoke `transformHtml`;
4. update headers (`Content-Length`, `ETag`, `Vary`, cache directives);
5. write the transformed HTML.

This package must contain **no transformation logic**. Anything that decides
*what* the output looks like belongs in `@heo/core`.
