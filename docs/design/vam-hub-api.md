# Design: VaM Hub API reference

> **Status:** Draft — reference material for a feature not yet scheduled for
> implementation.
> **Roadmap:** [VaM Hub integration + Discover + Cleanup view](../roadmap/hub-cleanup.md).

Reference for the **Virt-A-Mate Hub** (`hub.virtamate.com`) HTTP surface, derived
from network traces of the official VaM client. Numeric database fields are
almost always serialized as **strings** in JSON (e.g. `"package_id": "20623"`,
`"rating_count": "7"`) — treat them accordingly throughout.

This document is the technical surface the [roadmap doc](../roadmap/hub-cleanup.md)
depends on; it has no vision/UX content of its own.

## Table of contents

- [Transport](#transport)
- [Actions](#actions)
  - [`getInfo` — filter options](#getinfo--filter-options)
  - [`getResources` — search / browse](#getresources--search--browse)
  - [`getResourceDetail` — single resource](#getresourcedetail--single-resource)
  - [`findPackages` — bulk resolve package names](#findpackages--bulk-resolve-package-names)
- [Downloads (binary `.var`)](#downloads-binary-var)
- [Secondary endpoints](#secondary-endpoints)
  - [`packages.json` — bulk package index](#packagesjson--bulk-package-index)
  - [Website / embedded browser URLs](#website--embedded-browser-urls)
- [Separate authenticated `/api`](#separate-authenticated-api)

## Transport

All actions: `POST https://hub.virtamate.com/citizenx/api.php` with
`Content-Type: application/json`, `Accept: application/json`, UTF-8 JSON body.
Every request carries `{"source": "VaM", "action": "<name>"}` plus
action-specific fields; omit or pass `""` to disable filter slots. The server
echoes effective parameters under `parameters`. HTTP is always `200` — check
`status`. Action sections below omit this preamble and show only the
request/response bodies.

**Cookie:** `vamhubconsent=1` (or `=yes`) — required for `.var` downloads,
optional for API POSTs.

**User-Agent:** nothing server-enforced. To match the official VaM client:

```
User-Agent: UnityPlayer/2018.1.9f1 (UnityWebRequest/1.0, libcurl/7.51.0-DEV)
X-Unity-Version: 2018.1.9f1
Accept-Encoding: identity
```

**Client compatibility notes**, if ever matching the official client's exact
request shape becomes necessary:

- Disable `Expect100Continue` on the HTTP client — the official client never
  sends an `Expect: 100-continue` header.
- `Content-Type` must be exactly `application/json`, not
  `application/json; charset=utf-8`.
- The official client inserts a space after commas in the JSON body
  (`, "` instead of `,"`). The Hub accepts standard JSON regardless; this only
  matters for byte-for-byte traffic comparison, not for correctness.

**Errors** use a common envelope, with action-specific errors echoing the
relevant lookup key:

**Request:**

```json
{ "source": "VaM", "action": "bogus" }
```

**Response:**

```json
{ "status": "error", "error": "Invalid action" }
```

e.g. `getResourceDetail` with unknown id →
`{"status": "error", "error": "Resource not found.", "resource_id": "99999999"}`.

`findPackages` is the exception — missing keys yield per-key string-`"null"`
placeholders instead.

## Actions

Typical flow: `getInfo` at startup → `getResources` for browse/search →
`getResourceDetail` for one resource (gets `hubFiles[]` + `dependencies`) →
`findPackages` for bulk name→URL resolution.

### `getInfo` — filter options

Populates filter/sort pickers (`sort`, `location`, `category`, `type` arrays;
`tags` and `users` histograms) and returns a `last_update` cache-buster for
[`packages.json`](#packagesjson--bulk-package-index).

**Request:**

```json
{ "source": "VaM", "action": "getInfo" }
```

**Response** (abbreviated — tag/user histograms can run into the thousands of
keys, several hundred KB total):

```json
{
  "status": "success",
  "parameters": {
    "action": "getInfo",
    "location": "",
    "category": "",
    "username": "",
    "tags": "",
    "type": "",
    "sort": "",
    "search": "",
    "searchall": "false",
    "page": "1",
    "perpage": "24",
    "min_tag_ct": "5",
    "min_user_ct": "1",
    "source": "VaM"
  },
  "sort": [
    "Latest Update", "Hot Picks", "Rating", "Reaction Score",
    "Trending Downloads", "Trending Positives", "Downloads",
    "Most Reviewed", "A-Z"
  ],
  "other_options": {
    "search": "text to search on",
    "searchall": "default is FALSE. when FALSE, will only search the title. when TRUE search will also check the username, tag_line and tags fields"
  },
  "location": ["Hub", "Hub And Dependencies", "External"],
  "last_update": "1776818756",
  "category": ["Free", "Paid", "Paid Early-Access", "VaM2"],
  "type": [
    "Assets + Accessories", "Audio", "Blend Shapes", "Clothing",
    "Comics + Storytelling", "Demo + Lite", "Environments", "Guides",
    "Hairstyles", "Lighting + HDRI", "Looks", "Mocap + Animation",
    "Morphs", "Other", "Plugins + Scripts", "Poses", "Scenes", "Skins",
    "Textures", "Toolkits + Templates", "Voxta Content"
  ],
  "tags": {
    "#bimbo": { "ct": 5 },
    "abs": { "ct": 38 }
  },
  "users": {
    "14mhz": { "ct": "36" }
  }
}
```

- `tags[label].ct` is a JSON **integer**; `users[username].ct` is a **string**
  (asymmetric). Gated by `min_tag_ct` / `min_user_ct`.
- `last_update` is unix seconds (string).
- `other_options` are free-form hints, not enums.

### `getResources` — search / browse

Paginated list with filter + sort. `pagination.next_page` / `prev_page` are
query-string fragments starting with `?&` (not full URLs); empty when absent.

**Request:**

```json
{
  "source": "VaM",
  "action": "getResources",
  "latest_image": "Y",
  "perpage": "48",
  "page": "1",
  "sort": "Latest Update"
}
```

All fields are strings. Filter slots (`location`/`category`/`type`/`username`/`tags`)
take one value from the matching `getInfo` array. Non-obvious fields:

- `latest_image: "Y"` — return the latest resource image.
- `sort_secondary` — secondary sort label. Alternate syntax: join both into
  `sort` as `"Primary,Secondary"`.
- `searchall: "true"` — also match `username` / `tag_line` / `tags` (default
  `"false"`: title only).

**Response** (one resource inlined):

```json
{
  "status": "success",
  "pagination": {
    "page": "1",
    "perpage": "2",
    "total_found": 49051,
    "total_pages": 24526,
    "next_page": "?&page=2&perpage=2",
    "prev_page": ""
  },
  "resources": [
    {
      "package_id": "72299",
      "hub_hosted": "0",
      "resource_id": "66186",
      "title": "Moya - German Gamer Girl",
      "tag_line": "Cute look of a german gamer girl called 'Moya'",
      "username": "ErrorC9",
      "type": "Looks",
      "external_url": "https://discord.gg/C6jX8Fp43F",
      "download_count": "0",
      "rating_avg": "0",
      "tags": "babe,cute,emo,german,germany,goth,kawaii,scene girl,teen 18+,young",
      "promotional_link": "https://discord.gg/C6jX8Fp43F",
      "version_string": "v1",
      "category": "Free",
      "image_url": "https://1424104733.rsc.cdn77.org/data/resource_icons/66/66186.jpg?1776817697",
      "hubDownloadable": "true",
      "dependency_count": 32,
      "hubFiles": [
        {
          "package_id": "72299",
          "filename": "ErrorC9.Moya_German.1.var",
          "file_size": "3974881",
          "licenseType": "CC BY",
          "creatorName": "ErrorC9",
          "programVersion": "1.22.0.3",
          "username": "ErrorC9",
          "urlHosted": "https://hub.virtamate.com/resources/66186/download?file=584887"
        }
      ],
      "hubHosted": "false"
    }
  ]
}
```

- `tags` is a **comma-separated string**, not an array; empty string = none.
- `*_date` / `last_update` are unix seconds (string).
- `popularity` is often JSON `null`.
- `hub_hosted` (`"0"`/`"1"`) and `hubHosted` (`"true"`/`"false"`) are redundant
  siblings meaning the same thing.
- `hubDownloadable: "true"` + non-empty `hubFiles[]` ⇒ downloadable from Hub. A
  resource can be downloadable without being Hub-hosted (common for external
  mirrors that still register a Hub listing).

### `getResourceDetail` — single resource

Same top-level shape as a `getResources.resources[*]` entry, **no outer
wrapper**, plus a `dependencies` map. Address by `resource_id` **or**
`package_name` (`.latest` / `.minN` / `.N` all accepted; returned `filename` is
always concrete).

**Request:**

```json
{ "source": "VaM", "action": "getResourceDetail", "latest_image": "Y", "resource_id": "1179" }
```

or

```json
{ "source": "VaM", "action": "getResourceDetail", "latest_image": "Y", "package_name": "AshAuryn.Expressions.latest" }
```

Unknown id/name → `{"status": "error", "error": "Resource not found.", "resource_id": "..."}`
(no top-level resource fields).

**Response** — top-level fields per `getResources`; `dependencies` carries one
entry per shape variant (`.latest` resolved, concrete `.N` resolved, `.minN`
resolved, unresolvable):

```json
{
  "package_id": "671",
  "resource_id": "211",
  "title": "Space Force",
  "username": "Spacedog",
  "hubDownloadable": "true",
  "hubHosted": "true",
  "dependency_count": 4,
  "hubFiles": [
    {
      "filename": "Spacedog.Space_Force.4.var",
      "licenseType": "CC BY",
      "urlHosted": "https://hub.virtamate.com/resources/211/download?file=20097"
    }
  ],
  "dependencies": {
    "Spacedog.Space_Force": [
      {
        "package_id": "19961",
        "packageName": "Molmark.Cumpack",
        "filename": "Molmark.Cumpack.latest",
        "licenseType": "CC BY-NC",
        "version": "latest",
        "latest_version": "2",
        "latest_version_string": "2",
        "downloadUrl": "https://hub.virtamate.com/resources/1125/version/21060/download?file=82325",
        "promotional_link": "https://www.patreon.com/molmark"
      },
      {
        "package_id": null,
        "packageName": "Xstatic.MegaParticlePack",
        "filename": "Xstatic.MegaParticlePack.latest",
        "licenseType": "CC BY",
        "version": "latest",
        "latest_version": null,
        "downloadUrl": null
      }
    ]
  }
}
```

**Dep entries** differ from `hubFiles[]`:

- `packageName` — base name, no version.
- `filename` — dep-ref **verbatim**, no `.var`. Do not write to disk as-is —
  build `packageName + "." + latest_version + ".var"` instead.
- `version` — raw segment: `"latest"`, `"minN"`, or numeric string.
- `latest_version` — authoritative concrete integer (string); numeric ref ⇒
  equals `version`; `.latest`/`.minN` ⇒ resolved integer; unresolvable ⇒ JSON
  `null`. Fall back to `findPackages` when null or non-numeric.
- `latest_version_string` — creator's display version (`"v6.5.1"`), not always
  numeric and unrelated to `version`.
- `downloadUrl` ≡ `latestUrl` in every observed capture. No `urlHosted` on deps.
- **Unresolvable** deps keep `packageName`/`filename`/`version`/`licenseType`;
  everything else is JSON `null` and `promotional_link` is absent. Contrast
  `findPackages`, which uses the **string** `"null"` instead.

`dependencies` is always a single-key object; the key depends on query shape
(echoes the query when there are no deps, otherwise the package's base name).
Use the array, not the key. Empty deps → value `[]`.

**`hubFiles[]` entries** (same shape here and in `getResources`):

- `creatorName` is a display name (`"Acid Bubbles"`); `username` is the
  URL-safe handle (`"AcidBubbles"`) — they may differ.
- `programVersion` is the VaM version the file was built against.
- `urlHosted` is the fetchable URL (see [Downloads](#downloads-binary-var)).

### `findPackages` — bulk resolve package names

Comma-separated list → Hub file metadata. Much cheaper than N ×
`getResourceDetail`. Batches of ~50 keys work. **No top-level `status`** —
`packages` present means success.

**Request:**

```json
{
  "source": "VaM",
  "action": "findPackages",
  "packages": "AcidBubbles.Embody.latest,AshAuryn.Expressions.5,NoSuch.Package.1"
}
```

**Response** — one entry per key shape (`.latest`, concrete `.N`, `.minN`,
missing). Resolved entries always return the concrete `.var` filename
regardless of input form:

```json
{
  "packages": {
    "AcidBubbles.Embody.latest": {
      "filename": "AcidBubbles.Embody.61.var",
      "file_size": "117537",
      "licenseType": "CC BY-SA",
      "package_id": "44580",
      "resource_id": "6513",
      "username": "Acid Bubbles",
      "downloadUrl": "https://hub.virtamate.com/resources/6513/version/69006/download?file=421752"
    },
    "NoSuch.Package.1": {
      "filename": "null",
      "file_size": "null",
      "licenseType": "null",
      "package_id": "null",
      "resource_id": "null",
      "downloadUrl": "null"
    }
  }
}
```

Resolved entries are a subset of `hubFiles[*]`. Missing entries have every
field literally `"null"` (string, not JSON `null`); `username` is omitted.
Detect with `filename === "null"` or `downloadUrl === "null"`. A `downloadUrl`
ending in literal `?file=` (empty `file` param) is broken — retry by filename.

## Downloads (binary `.var`)

Resolve a URL from `hubFiles[*].urlHosted`, `dependencies[*][*].downloadUrl` /
`latestUrl`, or `packages[*].downloadUrl`, then GET with the consent cookie and
follow the `303`.

**Request:**

```
GET https://hub.virtamate.com/resources/1179/download?file=230625
Cookie: vamhubconsent=yes
```

**Response** (two hops):

```http
HTTP/2 303
Location: https://1424104733.rsc.cdn77.org/internal_data/attachments/230/230653-a292c8391771d628fcbaa2b4579c81ad.data

HTTP/2 200
Content-Type: application/octet-stream
Content-Length: 9685521
Content-Disposition: filename="AshAuryn.Expressions.5.var";
```

**URL preference:** `downloadUrl` when non-empty and ≠ `"null"`, else
`urlHosted` / `latestUrl`. URLs ending in `?file=` are broken. To resolve a
flexible `.latest` / `.minN` filename to the concrete version, re-query
`getResourceDetail?package_name=…` (or read `meta.json` inside the downloaded
`.var` zip).

## Secondary endpoints

### `packages.json` — bulk package index

Flat `.var` filename → numeric `resource_id` map, served from CDN77 (multi-MB,
grows over time). Cache-bust with `?<getInfo.last_update>`. Keys are always
concrete versioned filenames (no `.latest` / `.minN`).

**Request:**

```
GET https://s3cdn.virtamate.com/data/packages.json?1776818756
```

**Response:**

```json
{
  "!AjaX.Allwyn.1.var": 55808,
  "10thToaster.Clara.2.var": 12425
}
```

Values are JSON **integers** (not strings).

### Website / embedded browser URLs

Plain HTML URLs, suitable for in-app WebView panels:

| Pattern | Purpose |
| --- | --- |
| `https://hub.virtamate.com/resources/{resourceId}` | Resource page |
| `https://hub.virtamate.com/resources/{resourceId}/overview-panel` | Overview tab |
| `https://hub.virtamate.com/resources/{resourceId}/updates-panel` | Updates tab |
| `https://hub.virtamate.com/resources/{resourceId}/review-panel` | Reviews tab |
| `https://hub.virtamate.com/resources/{resourceId}/history-panel` | History tab |
| `https://hub.virtamate.com/resources/?q={query}` | Website search |
| `https://hub.virtamate.com/threads/{threadId}` | Forum thread |
| `https://hub.virtamate.com/threads/{threadId}/discussion-panel` | Thread discussion tab |

## Separate authenticated `/api`

A JSON API at `https://hub.virtamate.com/api` requiring an **API key**,
distinct from the action-based `citizenx/api.php`. No confirmed
request/response shapes; integration would need this characterized first if it
ever becomes necessary.
