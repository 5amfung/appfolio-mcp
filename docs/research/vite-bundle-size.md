# Vite bundle warning and the available fixes

Research date: 2026-11-15. The lazy-loading implementation and measured results
are recorded below.

## Conclusion

The 500 kB message is a configurable performance warning, not a deployment or
JavaScript size limit. Vite compares the uncompressed output chunk against the
threshold. Compression reduces transfer size but does not remove the JavaScript
the browser must parse and execute.
[Vite 8.3.8 configuration](https://github.com/vitejs/vite/blob/v8.3.8/docs/config/build-options.md#L359)

My recommendation is to measure the module composition, then load the existing
PostHog SDK through a dynamic import after the application mounts and only when
browser analytics is configured. Keep the existing threshold while checking the
result. Evaluate PostHog's experimental slim entrypoint separately if further
reduction is useful.

## What the maintainers provide

| Approach                      | Verified behavior and tradeoff                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspect the bundle            | Vite DevTools for Rolldown shows module graphs, chunk composition, package sizes, duplicates, and comparisons between builds. This distinguishes a large dependency from application code before changing chunk boundaries. [Vite DevTools](https://devtools.vite.dev/rolldown/#what-it-does)                                                                                                                                                                                                                                                   |
| Load features with `import()` | Vite supports async chunks and automatically preloads their shared dependencies in parallel when the dynamic import runs. This creates a loading boundary in application code. It need not remove the dependency's bytes from a visit that eventually uses the feature. [Vite async loading](https://vite.dev/guide/features#async-chunk-loading-optimization)                                                                                                                                                                                  |
| Split routes automatically    | TanStack Router transforms route components into lazy chunks. TanStack Start already installs its code splitter for client and server builds, so adding a second router plugin is unnecessary here. [Router behavior](https://tanstack.com/router/latest/docs/guide/automatic-code-splitting#how-does-it-work), [Start source at the installed React Start release](https://github.com/TanStack/router/blob/%40tanstack/react-start%401.169.5/packages/start-plugin-core/src/vite/start-router-plugin/plugin.ts#L151)                           |
| Import fewer SDK features     | PostHog documents `posthog-js/dist/module.slim`, with optional extension bundles. The slim API is experimental. Automatic pageview tracking belongs to `AnalyticsExtensions`, so swapping only the import can change existing behavior. [PostHog slim documentation](https://posthog.com/docs/libraries/js#tree-shaking-with-the-slim-bundle-advanced)                                                                                                                                                                                          |
| Set manual chunk groups       | Vite 8 exposes `build.rolldownOptions.output.codeSplitting`. Rolldown supports vendor groups for loading and caching choices. Its documentation warns that manual groups can affect module side effects; splitting a statically required vendor into a different file does not by itself make it optional. [Vite chunking](https://vite.dev/guide/build#chunking-strategy), [Rolldown explanation](https://rolldown.rs/in-depth/manual-code-splitting), [Rolldown execution warning](https://rolldown.rs/reference/OutputOptions.codeSplitting) |
| Choose another warning budget | `build.chunkSizeWarningLimit` is an official setting. Raising it changes reporting, not the emitted bundle. Accepting a larger budget can be reasonable after checking load and execution costs; it does not establish that the application became faster. [Vite setting](https://vite.dev/config/build-options#build-chunksizewarninglimit)                                                                                                                                                                                                    |

Older advice using the object form of `manualChunks` does not fit this build.
Rolldown 1.2.19 does not support that form and deprecates the function form in
favor of `codeSplitting`.
[Versioned Rolldown source](https://github.com/rolldown/rolldown/blob/v1.2.19/packages/rolldown/src/options/output-options.ts#L604)

## Evidence in this project

The root layout imports `PostHogAnalytics`, which statically imports `posthog-js`.
The token check happens in an effect after the import. The current integration
enables history-based pageviews and disables autocapture and recording.
[Root layout](../../src/routes/__root.tsx#L10),
[SDK import](../../src/components/posthog-analytics.tsx#L2),
[options and initialization](../../src/components/posthog-analytics.tsx#L26)

The installed versions inspected were Vite 8.3.8, Rolldown 1.2.19, React Start
1.169.5, and PostHog JS 1.447.12. The existing production output contains a
690,219-byte client entry chunk, 226,670 bytes with Node's gzip defaults, and a
163,458-byte shared account UI chunk. These are output measurements, not a module
attribution report. They do not prove that PostHog is the only contributor.
[Declared dependencies](../../package.json), [resolved versions](../../pnpm-lock.yaml)

The installed PostHog package includes both default and slim entrypoints, plus
`AnalyticsExtensions`. Published files measured 380,756 bytes for `dist/module.js`
and 159,531 bytes for `dist/module.slim.js`. Those standalone file sizes are not
the final application savings: shared dependencies, extension selection, and
tree shaking affect the final chunks.
[Published default entrypoint](https://unpkg.com/posthog-js@1.447.12/dist/module.js),
[published slim entrypoint](https://unpkg.com/posthog-js@1.447.12/dist/module.slim.js),
[published extension declarations](https://unpkg.com/posthog-js@1.447.12/dist/extension-bundles.d.ts)

Output sizes can be reproduced after a production build:

```sh
pnpm build
node --input-type=module <<'JS'
import fs from 'node:fs'
import { gzipSync } from 'node:zlib'
for (const file of fs.readdirSync('.output/public/assets')) {
	if (!file.endsWith('.js')) continue
	const bytes = fs.readFileSync('.output/public/assets/' + file)
	if (bytes.length > 100000)
		console.log(file, bytes.length, gzipSync(bytes).length)
}
JS
```

## Proposed implementation and acceptance

The smallest candidate changes only the SDK loading boundary. An asynchronous
initializer must retain initialization once across Strict Mode and remounts,
handle a failed SDK load without breaking login, and preserve the current URL
redaction. These requirements follow from the existing integration and tests.
[Initialization tests](../../src/components/posthog-analytics.test.tsx),
[real SDK privacy test](../../src/components/posthog-analytics.integration.test.tsx)

Acceptance should compare the production bundle before and after, verify which
chunks the initial page loads, and exercise navigation pageviews and URL
redaction with analytics enabled. The SDK should not be requested when analytics
is disabled. Login and OAuth must continue to work if the SDK cannot load.
Initial transfer and browser execution timings have not been measured in this
research.

## Lazy-loading result

The implementation changes the SDK import to `import('posthog-js')` inside the
client effect. It shares one initialization promise across Strict Mode effects
and remounts. A rejected import or initialization is contained at the optional
analytics boundary; a later mount can try initialization again. The existing
pageview, recording, and URL-redaction options are retained.
[Implementation](../../src/components/posthog-analytics.tsx)

Before and after builds ran on Node 24.22.1 with the same explicit test settings:

```sh
VITE_POSTHOG_KEY=phc_bundle_verification VITE_POSTHOG_HOST=https://posthog.invalid pnpm build
```

The baseline is commit `6ca41defbbae858904fea71fb73874963e3c54a9`. Sizes use the
measurement command above, including Node's default gzip settings.

| Client JavaScript  |     Before, bytes | After, bytes | Before gzip, bytes | After gzip, bytes |
| ------------------ | ----------------: | -----------: | -----------------: | ----------------: |
| Entry chunk        |           690,898 |      343,107 |            226,965 |           109,765 |
| Separate SDK chunk | Included in entry |      346,890 |  Included in entry |           117,130 |
| Account UI chunk   |           163,458 |      163,458 |             53,444 |            53,443 |

No emitted client chunk exceeded 500 kB, and the chunk-size warning disappeared.
The default warning threshold and chunk configuration were unchanged.
[Build configuration](../../vite.config.ts)

All 258 tests passed. Tests verify that server rendering and a missing token do
not load the SDK, concurrent mounts initialize it once, failures do not interrupt
the app, and real SDK enrichment still removes sensitive URL attribution.
[Loader tests](../../src/components/posthog-analytics.test.tsx),
[real SDK privacy test](../../src/components/posthog-analytics.integration.test.tsx)

Chromium checks against the built local server confirmed that SSR does not
preload the SDK, sign-in accepts input while its chunk is delayed, the real SDK
emits initial and navigation pageviews with one download, and a blocked SDK
chunk leaves sign-in usable without an unhandled browser error. The fixture
modeled a desktop visitor because PostHog intentionally filters WebDriver
traffic. Account reads and analytics transport were intercepted; these checks
made no database writes or AppFolio calls and did not send events to PostHog.

When analytics is enabled, the total JavaScript remains nearly the same. The
change moves SDK loading after hydration; it does not remove the SDK from a
visit that uses analytics. No browser latency improvement is claimed here.
