#!/usr/bin/env python3
"""Lyric Flow: one command from MP3 to rendered video.

Examples (run from the repo root, venv active):
    python run.py input/allcaps.mp3
    python run.py input/allcaps.mp3 --format square
    python run.py input/allcaps.mp3 --name allcaps --cover art.jpg --language en
    python run.py --name allcaps --skip-process        # re-render only
    python run.py --name allcaps --studio              # open live preview
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
FORMATS = {
    "vertical": (1080, 1920),
    "square": (1080, 1080),
    "landscape": (1920, 1080),
}


def run(cmd, cwd=None):
    print("\n$", " ".join(str(c) for c in cmd))
    subprocess.run(cmd, cwd=cwd, check=True)


def main():
    ap = argparse.ArgumentParser(description="Lyric Flow: MP3 to video")
    ap.add_argument("mp3", nargs="?", help="source MP3 (not needed with --skip-process)")
    ap.add_argument("--name", help="song folder name (default: from the MP3 filename)")
    ap.add_argument("--format", choices=FORMATS, default="vertical")
    ap.add_argument("--cover", help="cover image to copy in")
    ap.add_argument("--language", help="Whisper language code, e.g. en")
    ap.add_argument("--hook", type=float, default=15.0)
    ap.add_argument("--pre", type=float, default=5.0)
    ap.add_argument("--post", type=float, default=3.0)
    ap.add_argument("--skip-process", action="store_true", help="reuse existing audio and lyrics")
    ap.add_argument("--studio", action="store_true", help="open Remotion Studio instead of rendering")
    args = ap.parse_args()

    if not args.name:
        if not args.mp3:
            ap.error("give an MP3 or --name")
        args.name = re.sub(r"[^a-z0-9]+", "_", Path(args.mp3).stem.lower()).strip("_")

    npx = shutil.which("npx") or shutil.which("npx.cmd")
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npx or not npm:
        sys.exit("Node.js (npm/npx) not found on PATH.")

    # 1. Audio + lyrics
    song_dir = FRONTEND / "public" / "songs" / args.name
    if not args.skip_process:
        if not args.mp3:
            ap.error("give an MP3, or use --skip-process")
        cmd = [sys.executable, str(ROOT / "backend" / "process.py"), args.mp3,
               "--name", args.name,
               "--hook", str(args.hook), "--pre", str(args.pre), "--post", str(args.post)]
        if args.cover:
            cmd += ["--cover", args.cover]
        if args.language:
            cmd += ["--language", args.language]
        run(cmd)
    elif not (song_dir / "lyrics.json").exists():
        sys.exit(f"Nothing to reuse: {song_dir / 'lyrics.json'} not found.")

    if not (song_dir / "cover.jpg").exists():
        sys.exit(f"Missing {song_dir / 'cover.jpg'}. Add a cover or pass --cover.")

    # 2. Frontend dependencies
    if not (FRONTEND / "node_modules").exists():
        run([npm, "install"], cwd=FRONTEND)

    # 3. Props go through a file, which avoids shell quoting problems on Windows
    width, height = FORMATS[args.format]
    out_dir = FRONTEND / "out"
    out_dir.mkdir(exist_ok=True)
    props = out_dir / "props.json"
    props.write_text(json.dumps({"song": args.name, "width": width, "height": height}))

    # 4. Preview or render
    if args.studio:
        run([npx, "remotion", "studio", "src/index.ts", "--props=out/props.json"], cwd=FRONTEND)
        return

    output = f"out/{args.name}_{args.format}.mp4"
    run([npx, "remotion", "render", "src/index.ts", "LyricFlow", output,
         "--props=out/props.json"], cwd=FRONTEND)
    print(f"\nDone: {FRONTEND / output}")


if __name__ == "__main__":
    main()
