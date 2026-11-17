#!/usr/bin/env python3
"""Lyric Flow backend: pick a hook from an MP3, crop it, transcribe it.

Usage:
    python backend/process.py path/to/song.mp3 --name my_song
    python backend/process.py song.mp3 --name my_song --cover art.jpg --language en

Writes to frontend/public/songs/<name>/ :
    audio.mp3   cropped clip (5s lead-in + 15s hook + 3s tail by default)
    lyrics.json line + word timestamps relative to the clip start
    cover.jpg   copied from --cover, or extracted from the MP3's embedded art

Requires ffmpeg on PATH.
"""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np

SR = 22050
HOP = 512


def find_hook_start(path: str, hook: float, pre: float, post: float):
    """Return (hook_start_seconds, track_duration) for the highest-energy window."""
    y, sr = librosa.load(path, sr=SR, mono=True)
    duration = len(y) / sr

    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    n = min(len(rms), len(onset))
    rms, onset = rms[:n], onset[:n]

    def norm(x):
        return (x - x.min()) / (x.max() - x.min() + 1e-9)

    # Loudness matters most; onset strength favours busy, driving sections.
    score = 0.7 * norm(rms) + 0.3 * norm(onset)

    feat_rate = sr / HOP
    win = max(1, int(hook * feat_rate))
    if win >= n:
        return 0.0, duration

    csum = np.cumsum(np.insert(score, 0, 0.0))
    window_means = (csum[win:] - csum[:-win]) / win  # index = start frame

    # Keep room for the lead-in and tail so the padding is real song audio.
    lo = int(pre * feat_rate)
    hi = int((duration - hook - post) * feat_rate)
    hi = min(hi, len(window_means) - 1)
    if hi < lo:
        lo, hi = 0, len(window_means) - 1

    best = lo + int(np.argmax(window_means[lo : hi + 1]))
    return best / feat_rate, duration


def crop_audio(src: str, dst: Path, start: float, length: float):
    fade = 0.3
    af = f"afade=t=in:st=0:d={fade},afade=t=out:st={max(0.0, length - 0.5):.3f}:d=0.5"
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", src,
        "-af", af, "-ar", "44100", "-b:a", "192k", str(dst),
    ]
    subprocess.run(cmd, check=True)


def read_tags_and_cover(src: str, cover_dst: Path):
    """Return (title, artist) and write embedded cover art if present."""
    title, artist = "", ""
    try:
        from mutagen import File as MutagenFile
        from mutagen.id3 import ID3

        audio = MutagenFile(src, easy=True)
        if audio:
            title = (audio.get("title") or [""])[0]
            artist = (audio.get("artist") or [""])[0]
        tags = ID3(src)
        for key in tags.keys():
            if key.startswith("APIC"):
                cover_dst.write_bytes(tags[key].data)
                return title, artist, True
    except Exception:
        pass
    return title, artist, False


def transcribe(audio_path: Path, language: str | None):
    import whisper

    model = whisper.load_model("base")
    result = model.transcribe(
        str(audio_path),
        word_timestamps=True,
        fp16=False,
        language=language,
        condition_on_previous_text=False,
    )
    lines = []
    for seg in result["segments"]:
        words = [
            {"word": w["word"].strip(), "start": round(w["start"], 3), "end": round(w["end"], 3)}
            for w in seg.get("words", [])
            if w["word"].strip()
        ]
        text = seg["text"].strip()
        if not text:
            continue
        start = words[0]["start"] if words else seg["start"]
        end = words[-1]["end"] if words else seg["end"]
        lines.append({"start": round(start, 3), "end": round(end, 3), "text": text, "words": words})
    return lines


def main():
    ap = argparse.ArgumentParser(description="Lyric Flow audio processor")
    ap.add_argument("mp3")
    ap.add_argument("--name", required=True, help="song folder name")
    ap.add_argument("--cover", help="cover image to use (else embedded art is extracted)")
    ap.add_argument("--hook", type=float, default=15.0)
    ap.add_argument("--pre", type=float, default=5.0, help="seconds of lead-in before the hook")
    ap.add_argument("--post", type=float, default=3.0, help="seconds of tail after the hook")
    ap.add_argument("--language", default=None, help="Whisper language code, e.g. en (default: auto)")
    ap.add_argument(
        "--out",
        default=str(Path(__file__).resolve().parent.parent / "frontend" / "public" / "songs"),
    )
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found on PATH. Install it first.")

    out = Path(args.out) / args.name
    out.mkdir(parents=True, exist_ok=True)

    print("Finding high-energy hook...")
    hook_start, track_dur = find_hook_start(args.mp3, args.hook, args.pre, args.post)
    clip_start = max(0.0, hook_start - args.pre)
    clip_end = min(track_dur, hook_start + args.hook + args.post)
    clip_len = clip_end - clip_start
    print(f"  hook at {hook_start:.1f}s; clip {clip_start:.1f}s -> {clip_end:.1f}s ({clip_len:.1f}s)")

    audio_path = out / "audio.mp3"
    crop_audio(args.mp3, audio_path, clip_start, clip_len)

    cover_path = out / "cover.jpg"
    title, artist, embedded = read_tags_and_cover(args.mp3, cover_path)
    if args.cover:
        shutil.copy(args.cover, cover_path)
    elif not embedded:
        print("  No cover found. Add cover.jpg to the song folder manually.")

    print("Transcribing with Whisper (base)...")
    lines = transcribe(audio_path, args.language)

    payload = {
        "title": title or args.name.replace("_", " "),
        "artist": artist,
        "duration": round(clip_len, 3),
        "hookStart": round(hook_start - clip_start, 3),
        "lines": lines,
    }
    (out / "lyrics.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    print(f"Done: {out}  ({len(lines)} lines)")


if __name__ == "__main__":
    main()
