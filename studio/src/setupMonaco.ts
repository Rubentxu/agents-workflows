/**
 * Monaco Editor setup.
 *
 * We use @monaco-editor/react's default CDN loader (async, non-blocking).
 * monaco-yaml is NOT used (incompatible with Monaco v0.55.1 createWebWorker API).
 *
 * Per ADR-0016, YAML validation is handled server-side via POST /api/validate/:arn.
 * Monaco's built-in syntax highlighting works out of the box without workers.
 */
