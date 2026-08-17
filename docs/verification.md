# Reproducible verification

The production site is static authored HTML, CSS, and JavaScript. The Node dependencies in
`package.json` exist only to make its existing regression and browser checks repeatable; there is
no client bundle, framework runtime, deployment action, or publication command here.

## Clean local run

Use Node 20–24 and npm 10–11. From the repository root:

```text
npm ci
npm run install:browsers
npm run verify
```

`npm run install:browsers` installs the Chromium revision pinned by the checked-in Playwright
version. On a fresh Linux CI image, use the CI-equivalent command when system browser libraries
are absent:

```text
npx playwright install --with-deps chromium
```

The checks use Playwright's bundled Chromium by default. To deliberately use an already-installed
Chromium or Edge executable, set `CHROMIUM_PATH` to its executable path before running a browser
command. This is an override only; no machine-specific path is committed.

```text
CHROMIUM_PATH=/path/to/chromium npm run test:browser
```

On PowerShell, set the same override with `$env:CHROMIUM_PATH = 'C:\path\to\chrome.exe'`.

## Commands and scope

```text
npm run test:engine       # trusted engine/data regression pins
npm run test:data         # release manifest, compendium references, all 448 acquisition records
npm run test:delivery     # loading waterfall, domain contracts, preview, Atlas lazy behavior, and four repaired icons
npm run test:static       # active (non-commented) sitemap↔canonical equality; local HTML/CSS/metadata refs; all 448 generated icon files
npm run test:lifecycle    # tracked browser/artifact cleanup; IPC, signal-handler, hung-child, and nonzero-child runner cases
npm run test:browser      # loading, focused Build views, save/share reload, desktop/390px overflow, Films/Tales, local HTTP/assets, all 448 icon URLs
npm run test:a11y         # axe WCAG A/AA scan: Home, Build, Atlas, and every focused Build view; structural a11y regression checks
npm run test:performance  # exact throttled-mobile measurement
npm run verify            # every gate above, in order
npm start                  # manually serve the site at http://127.0.0.1:4173/
```

Browser commands start an uncompressed static server on an operating-system-selected loopback
port, pass it to the test as `ER_SITE_URL`, and always close it. On ordinary completion, browser
tests close their own Playwright browsers and temporary artifacts. On a delivered SIGINT/SIGTERM or
the portable IPC shutdown path, the runner first asks its active child to do the same and waits five
seconds. It then sends a direct-child SIGTERM, waits three seconds, and on platforms where the child
is still alive sends direct-child SIGKILL and waits another three seconds. It never uses a broad
process-tree kill.

Windows may force-terminate a child for Node's SIGTERM/SIGKILL rather than run its JavaScript signal
handlers; therefore browser/artifact cleanup is guaranteed for normal completion and the responsive
IPC path, while the bounded direct-child fallback guarantees the runner and temporary server do not
hang. The lifecycle suite invokes the same SIGINT/SIGTERM cleanup handlers on every platform and
also delivers real OS signals to a tracked browser fixture on POSIX; it intentionally makes no
Windows claim that forced signals run JavaScript cleanup. Test screenshots use an operating-system
temporary directory and are removed on normal exit or responsive runner shutdown.

## Performance profile

`npm run test:performance` is the comparison profile for Build Lab changes:

- Chromium/Edge engine, viewport **390 × 844**;
- browser cache disabled;
- **150 ms** latency, **200000 B/s** download, **80000 B/s** upload;
- local uncompressed static server;
- reports `DOMContentLoaded` and first visible useful `#stats .stat`; snapshots resource count and
  encoded bytes at that first-useful instant; separately labels the optional network-idle totals;
  and verifies no horizontal overflow.

Compare only runs made with this exact profile. Lower times and fewer bytes/resources are useful
signals, but they do not replace owner visual and gameplay review; the metrics deliberately do not
claim interaction quality or game-math correctness.

## CI

GitHub Actions runs on Ubuntu with Node 22, `npm ci`, the Playwright-pinned Chromium install, and
`npm run verify` for pushes and pull requests. Its permissions are read-only (`contents: read`) and
the workflow has no deployment, publish, release, or credential steps.
