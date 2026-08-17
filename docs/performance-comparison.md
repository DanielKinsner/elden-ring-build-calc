# Reproducible Build Lab performance comparison

Measured 2026-08-17 with `npm run test:performance:compare`.

The helper checked out the base content in a detached OS-temporary worktree, served both content
trees with the integration checkout's uncompressed `scripts/static-server.js`, and drove both runs
with the same Playwright-pinned bundled Chromium revision. It removes the temporary worktree in a
`finally` path and never moves the integration checkout's HEAD.

## Exact profile

- viewport: 390 × 844;
- cache disabled;
- latency: 150 ms;
- download: 200000 B/s; upload: 80000 B/s;
- first useful: first visible `#stats .stat`;
- resource count and encoded bytes: snapshot at that first-useful instant;
- local uncompressed static server; no horizontal overflow.

## Result

| Content | Commit | DOMContentLoaded | First useful | Resources at first useful | Encoded bytes at first useful |
| --- | --- | ---: | ---: | ---: | ---: |
| Historical base | `fc64a89d7c902bf6c9a319c7f29d42ecb3ae996c` | 2433.6 ms | 103768.6 ms | 86 | 19015738 |
| Integration content | `abc41c8cb57a0116dbff90060b7b01e8722324a6` | 2745.4 ms | 13421.9 ms | 79 | 1884103 |

Optional deferred totals after network idle were 101 resources / 19185000 encoded bytes for the
base and 95 resources / 4272125 encoded bytes for the integration content. They are intentionally
not used as the first-useful comparison point.

The following commit records this evidence only and does not change served runtime content; the
same comparator is run again against its final branch HEAD in the implementation report.
