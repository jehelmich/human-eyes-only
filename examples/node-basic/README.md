# example: node-basic

The smallest end-to-end demonstration of HEO: a plain Node HTTP server that
serves one article marked with `data-heo` through `@heo/middleware`.

```bash
pnpm --filter @heo/example-node-basic start
```

Use it to verify the v0.1 vertical slice by hand — the page should read
identically to a human, while `curl` should not.
