# Changelog

## 0.1.0

First scanner release. The `dsh-vet/v1` report contract (draft since the
repository bootstrap) now has a reference implementation.

- `resolveTarget`: npm packages via registry metadata only, tarballs verified
  against `dist.integrity` before extraction; local paths with zero network;
  git repos via depth-1 clone. Extraction is a hand-rolled ustar/PAX reader
  with path-traversal guards (ROADMAP D4).
- Analysis engine: acorn AST pass (ESM + CJS fallback), module graph from
  `main`/`module`/`exports`/`bin` with unreachable files tracked separately,
  per-file capability model, obfuscation signal collection.
- 15 rules across `perm.*` / `dep.*` / `obf.*` / `egress.*`, each with a
  public rationale in `docs/rules/`. Conservative calibration: findings that
  depend on runtime values default to `low` confidence (D2); seam
  declarations read from `dsh.seams` (D5).
- CLI: human summary, `--json` reports, exit `0` on any completed report,
  `--strict` / `--fail-on` thresholds, `--rules` filter.
- Fixture corpus covering every rule with byte-identical golden-report
  tests; CI scans the corpus on every push.
- Calibration: 11-package ecosystem sweep recorded in
  `docs/calibration-v0.1.md`; hex-payload diversity floor and an all-real
  typosquat name list came out of it.
- Self-audit: `examples/dsh-vet.report.json` is generated from the exact
  tarball that ships.
