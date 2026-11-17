# AGENTS.md

Guidance for AI coding agents working on Lyric Flow.

## What this project is

A two-part pipeline that makes Spotify-style lyric videos from an MP3:

1. `backend/` (Python): picks a high-energy hook with librosa, crops it with ffmpeg, transcribes it with local Whisper (base model).
2. `frontend/` (Node, Remotion + React + TypeScript): renders the video from the generated files.

The two halves communicate only through files in `frontend/public/songs/<name>/`: `audio.mp3`, `lyrics.json`, `cover.jpg`.

## Commands

```bash
# Backend (repo root, venv active)
pip install -r backend/requirements.txt
python backend/process.py "input/<file>.mp3" --name <name> [--cover art.jpg] [--language en]

# Frontend (from frontend/)
npm install
npx remotion studio src/index.ts
npx remotion render src/index.ts LyricFlow out/<name>.mp4 --props="{\"song\":\"<name>\"}"
npx tsc --noEmit            # type check
```

There is no automated test suite yet. Verify changes by running `tsc --noEmit` and previewing in Remotion Studio.

## Contracts you must not break

- **Audio defaults:** clip = 5 s lead-in + 15 s hook + 3 s tail. Keep these as the CLI defaults.
- **`lyrics.json` shape** (also typed in `frontend/src/types.ts`):
  `{ title, artist, duration, hookStart, lines: [{ start, end, text, words: [{ word, start, end }] }] }`.
  Times are in seconds, relative to the start of `audio.mp3`. If you change the shape, update `process.py` and `types.ts` together.
- **Cover file** is `cover.jpg`. It is referenced in `LyricFlow.tsx` and written in `process.py`; change both or neither.
- **Resolution:** `Root.tsx` takes `width` and `height` props, default 1080x1920. Video length comes from `lyrics.duration` via `calculateMetadata`, not a hard-coded value.
- **Visual spec:** layer 1 is the cover scaled up with `blur(60px)` and saturation; layer 2 is a crisp rounded card with a soft shadow; a dark vignette gradient (`rgba(0,0,0,0.6)` to `0.8`) sits on top; lyrics slide vertically with active line white, past lines fading upward, upcoming lines dimmed.

## Code conventions

- Remotion: drive all animation from `useCurrentFrame()`, `interpolate`, and `spring`. No CSS transitions, CSS animations, or `setTimeout`; they do not render deterministically.
- Load assets with `staticFile()` and `<Img>` / `<Audio>` from `remotion`, not plain `<img>` / `<audio>`.
- Keep `remotion` and every `@remotion/*` package on the same exact version.
- Lyric scroll position is the sum of one eased step per line (`SCROLL_SECONDS` in `LyricFlow.tsx`). Keep that approach so scrolling stays continuous when lines are close together.
- Python: standard library plus `librosa`, `numpy`, `openai-whisper`, `mutagen`; ffmpeg via `subprocess`. Keep `process.py` runnable as a single-file CLI.
- Browser storage APIs are not needed here; this is a render pipeline, not a web app.

## Do not commit

Source MP3s (`input/`), generated song folders, rendered videos, `.venv/`, `node_modules/`, `.env`. These are in `.gitignore`. Do not add copyrighted audio or artwork to the repo.

## Known limitations

- Whisper (base) can mishear sung lyrics. The README tells users to review `lyrics.json`.
- Word-level timestamps are saved but not yet used for the visuals (a word-by-word highlight is a natural next feature).
- Very long lines clamp to two lines in the lyric area.
- Hook detection uses energy only. It does not detect song structure, so the pick is usually the loudest section, not always the chorus.
