# @heo/middleware

Generic Node HTTP middleware that buffers an outgoing HTML response, hands it to
`@heo/core`, and writes the transformed result back.

```ts
import { heoMiddleware } from "@heo/middleware";

app.use(heoMiddleware());
```

Responsibilities, in order:

1. inspect the response content type, and bypass anything that is not HTML or
   that is already content-encoded;
2. buffer the HTML body;
3. invoke `transformHtml`, passing the request URL as `documentKey` and the
   response's `Content-Security-Policy` header as `contentSecurityPolicy`;
4. update headers — `Content-Length`, the `heo` declaration, `Cache-Control:
   no-store` for a request-scoped transform, the rewritten CSP, and dropping a
   now-wrong `ETag`;
5. write the transformed HTML.

This package must contain **no transformation logic**. Anything that decides
*what* the output looks like belongs in `@heo/core`.

## Options

Everything in [`HeoConfig`](../core/README.md#configuration) is accepted and
passed through. These four are the adapter's own.

| option | default | what it does |
| --- | --- | --- |
| `onError` | `"fail"` | What to do when core refuses. `"fail"` returns a 500 naming only the error class. `"passthrough"` serves the original bytes, which is a decision to publish that page's plaintext and should be made on purpose. |
| `maxBytes` | `4 MiB` | Responses larger than this are streamed through untouched rather than buffered. |
| `onTransform` | none | Called with core's `TransformStats` and the URL after every successful transform. |
| `onRefusal` | none | Called with the error and the URL when core refuses. This is where the reason goes: the 500 body carries the error class and nothing else, because a refusal happens over a protected value and the reader of a 500 on a protected route is as likely to be an extractor as an operator. |

`onError: "passthrough"` is a decision about one page. It does not apply to a
refusal about the configuration — a missing generator, or a carrier with no type
size — because those are wrong for every request, so passing through would
publish the whole site rather than one page, silently and for as long as the
configuration stands.
