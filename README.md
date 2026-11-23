# Louis! A Yoto Make Your Own (MYO) client backed by YouTube

This tree is a fork of [stuartromanek/louis](https://github.com/stuartromanek/louis) (MIT). Published Docker images, desktop installers, and the Home Assistant add-on image still come from that repository, so they **do not include this fork's changes** (SoundCloud search, MP3/M4B, Find icon, and the fixes in [CHANGELOG.md](CHANGELOG.md)). To run this fork, build it from source: [Run this fork](#run-this-fork-build-from-source).

![Louis](docs/images/louis-readme-banner.webp)

Louis turns YouTube into audio playlists for your [Yoto](https://yotoplay.com/). Search or paste a link, arrange tracks, then Update — Louis downloads and transcodes. Linking a physical **Make Your Own (MYO)** card happens in the Yoto app, not here.

Self-hosted **Nuxt** server app. Yoto OAuth token exchange and YouTube audio download (via yt-dlp) need a long-running server process, so a static export (Netlify/Vercel static, GitHub Pages, etc.) cannot power those flows.

**Website:** [louis.romanek.us](https://louis.romanek.us/) · install guides, FAQ, and desktop downloads for end users.

Demo:

[https://github.com/user-attachments/assets/717ae10e-c22e-40ae-8175-acfed4fce100](https://github.com/user-attachments/assets/717ae10e-c22e-40ae-8175-acfed4fce100)

[Website](https://louis.romanek.us/) · [Download](#download-desktop) · [Docker](#docker) · [Home Assistant](#home-assistant) · [Hosting](docs/HOSTING.md) · [Desktop docs](docs/DESKTOP.md) · [Contributing](CONTRIBUTING.md) · [Releases](docs/RELEASE.md)

**Personal use only.** You are responsible for complying with [YouTube’s Terms of Service](https://www.youtube.com/t/terms), [SoundCloud’s Terms of Use](https://soundcloud.com/terms-of-use), and applicable law when downloading audio.

## Features

- Search YouTube and preview audio — **YouTube Data API** when configured (faster typed search, optional content filtering), otherwise bundled **yt-dlp**. **Search: YouTube / YouTube Music / SoundCloud** checkboxes under the search box choose which sites typed searches use (results interleave; a video found on both YouTube and YouTube Music shows once). YouTube Music searches its Songs tab, which favours official studio tracks over music videos and covers. Neither YouTube Music nor SoundCloud search needs a key. Paste a video URL and choose **Add**, or a playlist URL and choose **Add all**. A channel URL still loads for review; check rows to add them together
- A Spotify track, album, or playlist link is matched to YouTube audio (Louis does not download from Spotify). Matching always uses yt-dlp search, never the Data API, so a long playlist doesn't use up your API quota. A SoundCloud track or playlist link is downloaded on Update
- **Add MP3 or M4B** uploads a file from this computer; an M4B becomes one track per chapter. Uploads are kept on the server until `LOUIS_AUDIO_CACHE_MAX_AGE_MS` passes
- If one video can't be downloaded during Update, a toast names it and offers **Retry** or **Remove & update**
- New tracks get a different picture from Yoto’s public icons, instead of every chapter sharing one default
- **Settings → General** sets split length (default 15 minutes, short leftovers folded in) and audio quality (default Standard / 96 kbps, so a chapter stays under Yoto’s 100 MB limit)
- Browse your Yoto playlists. **New** names a playlist and creates it on Yoto right away (empty, or with tracks already picked in Search)
- Drag-and-drop playlist editing (desktop); phone Search / Library flow with Add to playlist; **Add to Home**; phone Menu can Update every pending playlist at once
- Playlist covers: generated art on create; **Artwork** to generate, upload, search album and book covers by the playlist name, or crop a cover to Yoto’s default size (638×1011). Crops fill the frame (no black bars); large photos are re-encoded as JPEG to fit Yoto's upload limit. Rename or delete from the playlist menu
- **Find icons** gives every track an icon from Yoto's library or yotoicons.com: first a match for the track's own title, then the card name, then a reused match. Tracks with no match are named. For one track, click its icon → **Find icon for me** (phone: track menu → **Find icon**)
- Auto-split long YouTube sources (>55 min) into Part tracks; trim intros/outros before save
- Save / Update to Yoto with download and transcode progress; optional normalize for new YouTube extracts
- Per-track 16×16 art (Yoto icon library, [yotoicons.com](https://yotoicons.com/), upload, or draw) — reconnect Yoto once if icon upload asks for `user:icons:manage`
- Same app as **desktop** (macOS / Windows), **Docker**, or **Home Assistant** — installers are **unsigned** (Gatekeeper / SmartScreen may warn)



## Choose how to run


| You want…                    | Start here                                     |
| ---------------------------- | ---------------------------------------------- |
| Mac / Windows app, no Docker | [Download (desktop)](#download-desktop)        |
| Docker on a NAS / homelab    | [Docker](#docker) · [Hosting](docs/HOSTING.md) |
| Home Assistant on your LAN   | [Home Assistant](#home-assistant)              |
| Local Node development       | [Native development](#native-development)      |




## Download (desktop)

Installers ship as **Assets** on each GitHub Release (same `vX.Y.Z` as Docker):

**[Latest release](https://github.com/stuartromanek/louis/releases/latest)**


| Platform            | Asset                       |
| ------------------- | --------------------------- |
| macOS Apple Silicon | `Louis-<version>-arm64.dmg` |
| macOS Intel         | `Louis-<version>-x64.dmg`   |
| Windows             | `Louis-Setup-<version>.exe` |


After install, the setup wizard asks for a Yoto client ID, then a **recommended** YouTube Data API key (Skip uses bundled yt-dlp). Prefer **Use default client** for Yoto, or bring your own from [yoto.dev](https://yoto.dev/get-started/start-here/) and paste `http://127.0.0.1:4010/api/yoto/auth/callback` into **Allowed Callback URLs**. Change keys later in **Settings → Advanced**. Details: [docs/DESKTOP.md](docs/DESKTOP.md).

Installers are currently **unsigned** (Gatekeeper / SmartScreen may warn). Signing notes: [docs/DESKTOP_SIGNING.md](docs/DESKTOP_SIGNING.md). End-user install walkthroughs: [louis.romanek.us](https://louis.romanek.us/#install).

## Docker

Docker includes Node, yt-dlp, and ffmpeg — you only need Docker and a Yoto client ID.

```bash
git clone https://github.com/minorcoma/louis.git
cd louis
cp .env.example .env
# Paste Louis's bundled LOUIS_YOTO_CLIENT_ID or your own (see Self-host).
# Recommended: LOUIS_YOUTUBE_API_KEY
docker compose up -d --build
```

Open Louis at the same origin other devices will use (this machine: [http://localhost:4000](http://localhost:4000); phones/tablets: `http://<host-ip-or-name>:4000`). Health: `GET /api/health`.

Prebuilt images are **upstream's** (multi-arch `linux/amd64` + `linux/arm64` on each `v*` release) and don't include this fork's changes:

```bash
docker pull stuartromanek/louis:latest
# or pin: stuartromanek/louis:vX.Y.Z
```

Equivalent on GHCR: `ghcr.io/stuartromanek/louis:latest` (and `:vX.Y.Z`).

> Docker Hub anonymous pull rate limits can apply on busy hosts; GHCR is an equivalent fallback with the same tags.

**Homelab one-click:** Portainer app template, Coolify, and CasaOS notes — [docs/HOSTING.md](docs/HOSTING.md) (the Portainer and CasaOS installs use upstream's image). Cut releases: [docs/RELEASE.md](docs/RELEASE.md).

### Run this fork (build from source)

On a Linux homelab host, build from a clone and use host networking (so yt-dlp can use the host's IPv6 — see [HOSTING.md](docs/HOSTING.md#why-the-stack-uses-host-networking)). For example, in `/opt/louis`:

```bash
git clone https://github.com/minorcoma/louis.git src
```

`compose.yaml` next to `src/`:

```yaml
services:
  louis:
    image: louis:fork
    build:
      context: ./src
      args:
        YTDLP_CACHE_BUST: ${YTDLP_CACHE_BUST:-manual}
    container_name: louis
    network_mode: host          # listens on host port 4000
    env_file: .env              # LOUIS_YOTO_CLIENT_ID, LOUIS_YOTO_REDIRECT_URI, ...
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: 4000
      LOUIS_AUDIO_WORK_DIR: /data/audio
    volumes:
      - ./data:/data/audio
    restart: unless-stopped
```

Start it, and later update it (pulls the fork and rebuilds with a fresh yt-dlp):

```bash
cd /opt/louis
docker compose up -d --build                     # first run
git -C src pull && YTDLP_CACHE_BUST=$(date +%s) docker compose up -d --build   # update
docker image prune -f                            # drop the old image
```

Behind an HTTPS reverse proxy, use your own yoto.dev client with `https://<your-domain>/api/yoto/auth/callback` and set `LOUIS_COOKIE_SECURE=true`.

## Home Assistant

Install Louis from Supervisor as a custom add-on (wraps upstream's GHCR image; options map to `LOUIS_*`; audio under `/data/audio`; UI on host port **4000**, not ingress).

> The add-on is listed from this fork, but its Dockerfile builds `FROM ghcr.io/stuartromanek/louis:v1.3.0`, so it runs upstream 1.3.0 **without this fork's changes**.

1. **Settings → Apps → Install app → ⋮ → Repositories** (older releases: **Add-ons → Add-on store**) → add `https://github.com/minorcoma/louis`. Upstream `https://github.com/stuartromanek/louis` is rejected by current Supervisor until `youtube_safe_search` there is a schema type string.
2. Install **Louis**. Defaults use Louis’s bundled Yoto client and `http://homeassistant.local:4000/api/yoto/auth/callback` — no yoto.dev app needed if you keep both. Change the redirect off that URI only with your **own** public client (see [DOCS.md](homeassistant/louis/DOCS.md)). **youtube_api_key** is recommended (Data API search); leave empty to search with bundled yt-dlp. **youtube_safe_search** (`none` / `moderate` / `strict`) applies to typed search only when a key is set.
3. Open `http://homeassistant.local:4000` (or your host:port)

Full options, redirect URI, and `cookie_secure` notes: [homeassistant/louis/DOCS.md](homeassistant/louis/DOCS.md). Sources live under `homeassistant/`; root `repository.yaml` + `louis/` symlinks are for Supervisor discovery.

## Self-host



### 1. Yoto client ID

Louis ships a **public** PKCE client ID (not a secret): `PK00MDKCVwWvOG8o3px3qSl57FhfUZxm`. Paste it into `LOUIS_YOTO_CLIENT_ID` when you open Louis at a redirect already registered on Louis’s Yoto app — same value as desktop **Use default client** / the HA add-on default. There is **no** silent fallback if the env var is empty.


| Redirect (exact)                                         | Client                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `http://127.0.0.1:4010/api/yoto/auth/callback`           | Louis bundled (desktop) — see [DESKTOP.md](docs/DESKTOP.md) |
| `http://homeassistant.local:4000/api/yoto/auth/callback` | Louis bundled (HA default)                                  |


For any **other** origin (NAS IP, custom hostname, HTTPS domain), create your **own** public client at [yoto.dev](https://yoto.dev/get-started/start-here/) so you can register that exact `/api/yoto/auth/callback`, then use that client ID instead:


| Setting                                         | Value                                                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Allowed Callback URLs** (yoto.dev field name) | `http://<host-ip-or-name>:4000/api/yoto/auth/callback` or `https://your-domain/api/yoto/auth/callback` — same origin you open Louis |
| Scopes                                          | `offline_access user:content:view user:content:manage user:icons:manage`                                                            |


Ports: desktop OAuth is **4010** (`127.0.0.1` only). Docker / Home Assistant / reverse proxy (Nginx Proxy Manager, etc.) use **4000**, or your HTTPS hostname with no port when TLS terminates at the proxy. Paste the callback into **Allowed Callback URLs** — not Login URI / Logout URI.

### 2. YouTube API (recommended)

A YouTube Data API v3 key is **recommended** for faster search and `safeSearch=moderate` on typed search. In [Google Cloud Console](https://console.cloud.google.com/): create or pick a project, [enable YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com), then [create an API key](https://console.cloud.google.com/apis/credentials). If Google asks **What data will you be accessing?**, choose **Public data** (not User data) — Louis only needs an API key for public video search, not Google user OAuth. Restricting the key to YouTube Data API v3 is optional but smart. Walkthrough: [YouTube Data API getting started](https://developers.google.com/youtube/v3/getting-started).

Search still works without a key (bundled yt-dlp): slower, no safeSearch, and search can break on a different week than download. Leave `LOUIS_YOUTUBE_API_KEY` unset to use that path.

Each Data API search costs 100 of the default 10,000 daily quota units. Typed YouTube searches and video lookups use the key; Spotify matching and SoundCloud search never do. YouTube Music search runs through yt-dlp and only uses the key to fill in track details (1 unit per 50 tracks). When the quota runs out, search falls back to yt-dlp until it resets.

### 3. Environment

Copy `[.env.example](.env.example)`. Use `LOUIS_*` **names** so the same file works for local dev, `docker compose`, and `docker run --env-file .env` without rebuilding the image. Legacy `NUXT_`* / `NUXT_PUBLIC_*` names still work as a deprecated fallback (`LOUIS_*` wins when both are set).

#### Required


| Variable               | Notes                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `LOUIS_YOTO_CLIENT_ID` | Public PKCE client ID — Louis bundled (`PK00…`) for pre-registered redirects, or your own from yoto.dev |




#### Yoto


| Variable                  | Notes                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOUIS_YOTO_REDIRECT_URI` | Optional pin; must match the portal. Unset: Louis uses the Host the browser actually used. Prefer a hostname over a DHCP IP. Other devices cannot use the Docker host’s localhost |
| `LOUIS_YOTO_CLIENT_SECRET` | Only for a confidential server client. Leave unset for the public PKCE flow (recommended) |
| `LOUIS_COOKIE_SECURE`     | OAuth cookie `Secure` flag. Docker image defaults `false` (LAN HTTP). Node-without-Docker: when unset, secure iff `NODE_ENV=production`. Set `true` behind HTTPS                  |




#### YouTube / audio


| Variable                       | Notes                                                                                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOUIS_YOUTUBE_API_KEY`        | Recommended. YouTube Data API v3 (faster typed search). Unset: search without a key                                                                                                                       |
| `LOUIS_YOUTUBE_SAFE_SEARCH`    | Typed-search content filtering when a Data API key is set: `none`, `moderate` (default), or `strict`. Desktop: **Settings → Advanced**; HA: **youtube_safe_search** option                                |
| `LOUIS_AUDIO_WORK_DIR`         | Default `/data/audio` in Docker. Preview/save cache plus `logs/pipeline.jsonl` (YouTube extract diagnostics). For a long local capture, point this at a stable path rather than OS tmp. |
| `LOUIS_AUDIO_JOB_MAX_AGE_MS`   | Stale `jobs/` cleanup (default 1h)                                                                                                                                                                        |
| `LOUIS_AUDIO_CACHE_MAX_AGE_MS` | Cache file TTL (default 14d). Also how long uploaded MP3/M4B files are kept in `library/`. Expired files are removed on the next save or upload, not on a timer |
| `LOUIS_AUDIO_CACHE_MAX_BYTES`  | Combined preview + save cache cap (default 5 GiB), including SoundCloud downloads. Does not count `library/` (uploads expire by age only) or sweep `logs/`. Size the disk for a few audiobooks at up to 1 GB each |
| `LOUIS_YTDLP_PATH`             | Optional pin. Docker ships yt-dlp on `PATH`; Settings → Advanced can install a newer nightly into the audio volume / desktop app data (preferred when its version is newer)                               |
| `LOUIS_YTDLP_JS_RUNTIME`       | yt-dlp `--js-runtimes` value (default `node`). The desktop app sets this itself |
| `LOUIS_YTDLP_COOKIES_FILE`     | Optional Netscape `cookies.txt`. Downloads try anonymously first; cookies are used only if YouTube blocks with bot check, hard 403, or age-gate. Prefer a throwaway Google account; never commit the file |




#### Advanced / debug


| Variable                    | Notes                           |
| --------------------------- | ------------------------------- |
| `LOUIS_ENABLE_DEBUG_ROUTES` | `true` enables debug API routes |
| `LOUIS_PIPELINE_LOG` | Pipeline journal on by default (`logs/pipeline.jsonl` under the audio work dir). Set `0` to disable |
| `LOUIS_PIPELINE_LOG_VERBOSE` | `1` adds yt-dlp `-v` and larger stderr excerpts for a short capture window |

After capturing, copy `logs/` off the volume if needed and run:

```bash
npm run diagnose:pipeline -- /data/audio
npm run diagnose:pipeline -- --video dQw4w9wgXcQ --since 7d
```



```bash
docker run -p 4000:4000 --env-file .env louis:local
```



### 4. Deploy constraints

- **Single instance** — save-job progress is in memory
- **HTTPS in production** — Docker image defaults OAuth cookies to `LOUIS_COOKIE_SECURE=false` (LAN HTTP). Node-without-Docker defaults to `secure` when `NODE_ENV=production`. Set `true` behind TLS / reverse proxy; keep `false` for plain HTTP (Portainer LAN, Home Assistant)
- **Persistent disk** — recommended for the audio cache under `LOUIS_AUDIO_WORK_DIR` (`cache/preview/`, `cache/save/`, `library/` for uploaded MP3/M4B, `logs/`). Stale `jobs/` dirs and old cache files are swept on startup and after downloads; pipeline logs rotate by size and are not swept with the cache. Compose uses the named volume `louis-audio`



## Native development

For local Node (without Docker), install these first:

- Node.js 22+ (also used as yt-dlp’s JS runtime for YouTube signing)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — required for search (without a Data API key) and for save; keep it current
- [ffmpeg](https://ffmpeg.org/) — required for save
- Optional: `LOUIS_YOUTUBE_API_KEY` (faster search + `LOUIS_YOUTUBE_SAFE_SEARCH`); `LOUIS_YTDLP_COOKIES_FILE` as above

Self-host web UI has no YouTube key field — set `LOUIS_YOUTUBE_API_KEY` and `LOUIS_YOUTUBE_SAFE_SEARCH` in `.env` (desktop app: **Settings → Advanced**).

```bash
npm install
cp .env.example .env
npm run dev
```

Dev server: port **4000**. Tests: `npm test` (see [CONTRIBUTING.md](CONTRIBUTING.md)).

Production without Docker:

```bash
npm run build
npm run start
```



## License & notices

MIT — see [LICENSE](LICENSE).

Fonts (LT Saeada, self-hosted), OpenMoji icons, and [SND](https://snd.dev/) UI sounds are used; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Security reports: [SECURITY.md](SECURITY.md).