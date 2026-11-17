# Lyric Flow

Turn an MP3 into a Spotify-style lyric video. A Python backend picks the highest-energy hook and transcribes it with Whisper. A Remotion (React) frontend renders the video.

- Default output: 1080x1920 vertical (Reels / Shorts). Square and landscape are one prop away.
- Blurred, saturated album art background with a crisp rounded cover card and a dark vignette.
- Sliding lyrics: the active line is bright white, past lines fade upward, upcoming lines are dimmed.

## Requirements

- Python 3.10 to 3.12 recommended (Whisper depends on PyTorch, which can lag behind the newest Python)
- Node.js 18+
- [ffmpeg](https://ffmpeg.org/) on your PATH

## Project layout

```
lyric-flow/
  backend/
    process.py            # hook detection, audio crop, Whisper transcription
    requirements.txt
  frontend/
    src/
      index.ts
      Root.tsx            # composition, resolutions, metadata
      LyricFlow.tsx       # visual layout and kinetic lyrics
      types.ts
    public/songs/<name>/  # generated: audio.mp3, lyrics.json, cover.jpg
    package.json
  input/                  # your source MP3s (git-ignored)
```

## Setup

```bash
# backend
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt

# frontend
cd ../frontend
npm install
```

## 1. Process a song

From the repo root:

```bash
python backend/process.py "input/allcaps.mp3" --name allcaps
```

Options:

| Flag | Meaning | Default |
| --- | --- | --- |
| `--name` | Output folder name under `frontend/public/songs/` | required |
| `--cover` | Cover image to copy in (else embedded art is extracted) | none |
| `--hook` | Hook length in seconds | 15 |
| `--pre` | Lead-in seconds before the hook | 5 |
| `--post` | Tail seconds after the hook | 3 |
| `--language` | Whisper language code, e.g. `en` | auto |

This writes `audio.mp3`, `lyrics.json` and `cover.jpg` to `frontend/public/songs/<name>/`. Whisper can mishear sung lyrics, so review `lyrics.json` before rendering. If no cover was found, put a `cover.jpg` in that folder yourself.

## 2. Preview and render

```bash
cd frontend
npx remotion studio src/index.ts
```

Render (Windows `cmd` needs escaped double quotes; bash/zsh can use single quotes around the JSON):

```bash
# vertical 1080x1920 (default)
npx remotion render src/index.ts LyricFlow out/allcaps.mp4 --props="{\"song\":\"allcaps\"}"

# square
npx remotion render src/index.ts LyricFlow out/allcaps_sq.mp4 --props="{\"song\":\"allcaps\",\"width\":1080,\"height\":1080}"

# landscape (cover left, lyrics right)
npx remotion render src/index.ts LyricFlow out/allcaps_ls.mp4 --props="{\"song\":\"allcaps\",\"width\":1920,\"height\":1080}"
```

You can also keep props in a file: `--props=props.json`.

## How the hook is chosen

Every 15 second window of the track is scored on loudness (RMS, 70%) and onset strength (30%). The best window that leaves room for the lead-in and tail wins. The clip is cropped with ffmpeg and the video length follows the clip.

## Troubleshooting

- **"Error opening ... System error"**: the MP3 path is wrong. Use the real path, and quote names with spaces.
- **Whisper or PyTorch fails to install**: use Python 3.11 or 3.12 in a fresh virtual environment.
- **Remotion version mismatch**: pin every `remotion` and `@remotion/*` package to the same exact version.

## Notes

Song audio, generated clips and rendered videos are git-ignored. Only use music you have the rights to publish.
