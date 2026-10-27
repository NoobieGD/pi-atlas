# Pi Atlas public API

The API searches the digits already held by the server. It does not calculate pi. Ask `GET /api/status` for the current dataset size, engine version and available indexes. The PC currently serves 62,831,853,071 fractional digits. Its API must remain online for full-dataset searches. GitHub Pages hosts the frontend only.

Replace `https://YOUR-API` in examples with the website's configured API origin, without a trailing `/api`. The website's Connection panel shows its server URL. An API hosted alongside the website uses that website's origin. Read the HTML reference at `/api/docs` on the backend or `api.html` on the frontend.

No account or API key is required. Command-line and server-side clients can use the public URL. Browser JavaScript is subject to the host's existing CORS allowlist; operators can add a frontend origin with `ALLOWED_ORIGINS`. This update does not grant every unrelated browser origin access. Send JSON with `Content-Type: application/json` for POST requests.

## Quick start

```sh
curl -X POST https://YOUR-API/api/search \
  -H 'Content-Type: application/json' \
  -d '{"mode":"digits","query":"12345678","allResults":true}'
# {"id":"RANDOM_JOB_ID"}
curl https://YOUR-API/api/job/RANDOM_JOB_ID
```

Poll approximately once per second until `status` is `done`, `error` or `cancelled`. A `done` response means that response page finished. **Only `complete: true` means the whole requested range was searched.** An empty page can still have a continuation cursor after a time-limited scan. Overlapping occurrences are included.

## All results

Set **`"allResults": true`** in the initial search. This removes the overall match-count ceiling by enabling successive bounded response pages. It does not put billions of records in one JSON response.

1. Start the search and poll its job ID.
2. When `status: "done"`, save/process its `matches` exactly once.
3. If `complete` is true, finish. Otherwise POST `/api/job/ID/continue` with `{"page": N}`, using the **current response's zero-based `page`**.
4. Poll the same job ID for page `N + 1`, then repeat.

Sequence pages hold up to 5,000 matches; pixel pages hold up to 500. These are delivery page sizes, not total-result caps. A page may contain fewer matches if its scan time budget expires. Total scan time can span many pages. Each continuation rejoins the shared worker queue, allowing other visitors to run searches.

```sh
curl -X POST https://YOUR-API/api/job/RANDOM_JOB_ID/continue \
  -H 'Content-Type: application/json' -d '{"page":0}'
```

The job retains only the latest response page. Save it **before** requesting another. Repeating a continuation for an already acknowledged page will not skip a second page. Use one consumer per job. `totalMatches` counts matches produced by that job so far; `matches.length` counts only the current page. Your client must not append the same page twice while polling.

Without `allResults`, existing behavior remains: up to 300 sequence or 60 pixel matches per response. To continue that mode, start another search with the same settings and returned `nextCursor` as `cursor`, plus `nextAfterWidth` as `afterWidth` for pixels. Never increment, round or reconstruct a cursor yourself.

### Save every match directly to disk

The downloadable [`api-client.py`](api-client.py) uses only Python's standard library and writes one result per line to an NDJSON file. Its RAM use is bounded to a response page. A sidecar `.meta.json` records whether the scan completed; an interrupted or failed run is never marked complete.

```sh
python api-client.py --api https://YOUR-API --query 12345678 --output matches.ndjson
python api-client.py --api https://YOUR-API --mode text --scheme mod26 --query AHHDIH --output letters.ndjson
python api-client.py --api https://YOUR-API --mode text --scheme ascii --query dihh --output ascii.ndjson
python api-client.py --api https://YOUR-API --mode colors --query 87654321 --output colors.ndjson
python api-client.py --api https://YOUR-API --mode shape --rows '0110/1001/1001/0110' --width 100 --output pixels.ndjson
```

It refuses to overwrite an existing output. Ctrl+C attempts to cancel the current server page and keeps previously written matches. An unavailable server, disk exhaustion or an interrupted browser can prevent completion; check `complete`, not just file existence. For a new job starting from a saved cursor, use `--cursor` and `--after-width`; the new output covers only that remaining range.

## Search request

| Field | Default | Meaning |
|---|---|---|
| `mode` | `digits` | `digits`, `colors`, `text` or `shape` |
| `query` | Required except shapes | 1–2,048 ASCII characters; digit/color modes use `0`–`9` |
| `allResults` | `false` | JSON boolean; `true` enables the continuation protocol above |
| `scheme` | `mod26` | Text: `mod26`, `a1z26` or `ascii` |
| `alignment` | `0` | Starting raw-digit offset: 0–1 for pairs; 0–2 for ASCII |
| `cursor` | `0` | Exact zero-based continuation index in the selected encoding |
| `afterWidth` | `-1` | Pixel continuation's width tie-breaker; copy `nextAfterWidth` |
| `rule` | `threshold` | Pixel predicate: `threshold` or `parity` |
| `rows` | Required for shapes | 1–24 equal-width strings, 1–24 cells per row; `0`, `1`, `?` |
| `width` | `200` | Shape grid width, 1–4,096; at least the pattern width |
| `sweep` | `false` | Test a grid-width range for shapes |
| `minWidth`, `maxWidth` | `6`, `64` | Inclusive sweep bounds; at most `status.maxWidthSweep` widths |

Color searches match digit sequences exactly, using the website's ten-color palette. Commas and spaces in color queries are ignored.

Mod26 consumes pairs: decimal value modulo 26 maps 0→A, 1→B, …, 25→Z. A1Z26 consumes pairs: 01→A through 26→Z; all other pairs become a literal dot. ASCII consumes triples: 032–126 map to printable characters, other triples become a literal dot. A dot in a text query is a literal decoded dot, not a wildcard. Mod26/A1Z26 letter input is uppercased; ASCII preserves case. Leading/trailing query whitespace is stripped.

Threshold pixels map digits 0–4→0 and 5–9→1. Parity pixels map even digits→0 and odd digits→1. In shape rows, `?` is a wildcard; include at least one fixed `0` or `1`. Patterns cannot wrap across grid-row boundaries. For sweeps, two different widths at the same digit index are two distinct matches.

## Response fields and positions

```json
{
  "id": "RANDOM_JOB_ID",
  "status": "done",
  "allResults": true,
  "page": 0,
  "pageSize": 5000,
  "totalMatches": 604,
  "complete": true,
  "capped": false,
  "nextCursor": null,
  "matches": [
    {"index": 186557265, "position": 186557266, "unitPosition": 186557266, "length": 8}
  ]
}
```

This abbreviated example omits the remaining matches. Jobs begin as `queued`/`running`; progress and messages may update while scanning. `seconds` is the current page's server elapsed time, excluding queue/network time. `cacheHit`, `scanIO` and `searchRevision` describe execution. All-results jobs bypass the ordinary result cache. Indexes still accelerate their scans.

- `index` is zero-based in the selected encoding. Text indexes count encoded characters, digit/color/shape indexes count raw fractional digits.
- `position` is the one-based **raw digit position after the decimal point**. Pi's initial `3.` is excluded. For text: `position = index * step + alignment + 1`, where `step` is 2 or 3.
- `unitPosition` is one-based in the chosen sequence encoding. Shapes instead include `width`, `height` and `shapeWidth`.
- `scanned` is logical coverage through a source position, not a count of bytes physically read. An index can establish full-range results without rereading every digit. `totalUnits` is the selected encoding's length.
- `capped` means this delivery page filled. It never means there are no more matches. `nextCursor: null` together with `complete: true` marks the end.

## Endpoints

| Method / path | Purpose |
|---|---|
| `GET /api/health` | Availability, instance, current digit count, dataset and revision |
| `GET /api/status` | Dataset metadata, capabilities, page sizes, indexes and search budget |
| `GET /api/stats` | Precomputed dataset statistics |
| `POST /api/search` | Start a job; HTTP 202 with `{ "id": "…" }` |
| `GET /api/job/ID` | Poll the latest page/status |
| `POST /api/job/ID/continue` | All-results continuation; body `{ "page": N }`; HTTP 202 |
| `POST /api/search/cancel` | Cancel; body `{ "id": "…" }` |
| `GET /api/digits` | Small encoded window; example `?start=0&count=50&mode=digits` |
| `GET /api/tile` | Sampled rectangle for a zoomable view |
| `GET /api/docs` | This public reference as HTML |

`digits` accepts zero-based `start`, `count` (1–4,096), `mode` (`digits`, `colors`, `text`, `binary`), `scheme`, `rule` and `alignment`. `tile` adds `gridWidth` (1–4,096), `rowStart`, `colStart`, `rows`, `cols`, `rowStep` and `colStep`. Tiles allow at most 450,000 sampled cells and a 64 MiB raw-source span. Step values are 1–4,096. Tile rows are at most 2,048 and columns at most 4,096. Use a dataset window, not a full-file download.

## Limits, lifetime and errors

New searches allow a burst of three per client and refill one token per 30 seconds. Other API requests, including continuations, allow a burst of 120 and refill ten per second. Honor HTTP 429 `Retry-After`; keep polling modest. Queue capacity and scan time are host-configured; read status for the latter. Requests are at most 16 KiB. Jobs are held in memory, can expire after about one hour of inactivity, may be evicted under job pressure, and disappear after a server restart. Treat job IDs as private handles because anyone possessing one can poll, continue or cancel it.

HTTP 400 means invalid input/protocol, 403 means a disallowed browser origin, 404 means an unknown/expired job, 413 means an oversized request, 422 means an invalid query-string parameter, and 429 means rate/queue pressure. A job may also report `status: "error"` or `"cancelled"`; neither establishes full-range results. The backend logs omit client IP addresses and raw query contents.

## Website

Check **All results** before searching. The website automatically follows all pages and stores matches in browser IndexedDB. Its result list displays 200 records at a time; Previous/Next and the page number let you browse every collected match. This is a view size, not a total cap. Cancel stops further collection and retains collected results. A new search, reconnect or leaving/reloading the page clears its temporary result collection. Browser storage quotas and available disk still apply; storage failure stops visibly rather than silently truncating results.

Save JSON exports the collected results and a completion flag. Browsers supporting direct file saving stream exports to disk. Other browsers use a buffered download up to 128 MiB; for larger exports use the Python client above. This export compatibility limit does not limit search collection or API results. The standalone 100K version also supports automatic collection and paged browsing.
