#!/usr/bin/env python3
"""Build clearer teaching replays from unchanged, vowel-free human onsets."""

from __future__ import annotations

import json
import sys
import wave
from pathlib import Path


TARGETS = ("rieul.wav", "ssang-giyeok.wav", "ssang-digeut.wav", "ssang-bieup.wav")
SILENCE_MS = 120
EXPECTED_RATE = 48_000


def build_replay(source_path: Path, output_path: Path) -> dict[str, int | str]:
    with wave.open(str(source_path), "rb") as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2:
            raise ValueError(f"{source_path} must be mono 16-bit PCM")
        if source.getframerate() != EXPECTED_RATE or source.getcomptype() != "NONE":
            raise ValueError(f"{source_path} must be uncompressed 48 kHz PCM")
        frame_count = source.getnframes()
        pcm = source.readframes(frame_count)

    silence_frames = round(EXPECTED_RATE * SILENCE_MS / 1000)
    silence = bytes(silence_frames * 2)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output_path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(EXPECTED_RATE)
        output.writeframes(pcm + silence + pcm)

    return {
        "file": source_path.name,
        "sourceFrames": frame_count,
        "silenceFrames": silence_frames,
        "outputFrames": frame_count * 2 + silence_frames,
    }


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: build-consonant-clarity.py INPUT_ONSET_DIR OUTPUT_DIR")
    input_dir = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    results = [build_replay(input_dir / name, output_dir / name) for name in TARGETS]
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
