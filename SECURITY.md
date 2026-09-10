# Security policy

HEO draws a hard line between two kinds of report, and they are handled very
differently.

## Security vulnerabilities — report privately

A vulnerability is a defect that harms a site deploying HEO or its readers.
Examples:

- cross-site scripting introduced by the transformation;
- malformed or unparseable output;
- CSP bypass;
- arbitrary file access;
- denial of service (pathological input, unbounded memory or CPU);
- interference with CSRF or other security controls;
- mutation of form submissions, user input, scripts, or URLs.

Report these through GitHub's private vulnerability reporting on this
repository, or directly to the maintainer. Please do not open a public issue
first. Expect an acknowledgement within a few days.

## Successful extraction attacks — report publicly

Recovering protected content is **not** a security vulnerability. It is the
research contribution this project exists to measure.

> If you can extract HEO content faster or more accurately, submit the attack.

Preferred routes:

- a benchmark pull request adding your extractor under `benchmark/extraction/extractors/`;
- a public write-up, linked from an issue.

Attacks are welcome even when they defeat HEO completely. HEO makes an economic
claim, and an economic claim is only as good as the attacks that have been tried
against it.

## Scope reminder

HEO is not access control, encryption, or DRM. Content rendered for a human can
ultimately be recovered by a sufficiently capable automated system. Reports
premised on HEO being a secrecy mechanism are out of scope.
