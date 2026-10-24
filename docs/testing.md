# Check registry

Setup and broader validation guidance: [development.md](development.md).

| Check command | Scope | Behavior guarded |
| --- | --- | --- |
| `node --test --test-reporter=dot test/dependency-policy.test.mjs` | `package.json`, `package-lock.json`, `.github/dependabot.yml` | Both manifests request `~6.0.3`; the locked compiler is 6.0.x at patch 3 or later; only the root npm TypeScript updates at `>=6.1.0` are ignored, leaving 6.0 patches eligible. Configuration contracts use Node built-ins, like the existing CI configuration tests. |
| `npm ci && npm run validate` | Dependency installation and repository validation | Strict lockfile install, compiler/linter compatibility, unit tests, package contents, packaged registration, handler and Pi lifecycle smoke checks. Requires Node >=22.19.0; CI uses 22.19.0. |
| `npm run test:coverage` | Node unit suite and SonarQube input | Executes the suite with V8 coverage and generates `coverage/lcov.info`; not evidence of a remote SonarQube scan. |
