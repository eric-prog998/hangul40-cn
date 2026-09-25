#!/usr/bin/env python3
"""Extract short Korean consonant onsets from the licensed source WAV files."""

from __future__ import annotations

import hashlib
import json
import math
import struct
import sys
import wave
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "consonant-human-clips.json"


def read_pcm16_mono(path: Path) -> tuple[int, list[int]]:
    with wave.open(str(path), "rb") as source:
        if source.getsampwidth() != 2 or source.getnchannels() != 1:
            raise ValueError(f"{path} must be mono 16-bit PCM")
        rate = source.getframerate()
        frames = source.readframes(source.getnframes())
    return rate, list(struct.unpack(f"<{len(frames) // 2}h", frames))


def raised_cosine_fades(
    samples: list[float], rate: int, fade_in_ms: float, fade_out_ms: float
) -> None:
    fade_in = min(len(samples), round(rate * fade_in_ms / 1000))
    fade_out = min(len(samples), round(rate * fade_out_ms / 1000))
    for index in range(fade_in):
        samples[index] *= 0.5 - 0.5 * math.cos(math.pi * index / max(1, fade_in - 1))
    for offset in range(fade_out):
        index = len(samples) - fade_out + offset
        samples[index] *= 0.5 + 0.5 * math.cos(math.pi * offset / max(1, fade_out - 1))


def write_clip(source: Path, output: Path, item: dict[str, object]) -> dict[str, object]:
    source_bytes = source.read_bytes()
    actual_hash = hashlib.sha256(source_bytes).hexdigest()
    if actual_hash != item["sourceSha256"]:
        raise ValueError(f"source hash mismatch for {item['id']}: {actual_hash}")

    rate, samples = read_pcm16_mono(source)
    start = round(rate * float(item["startMs"]) / 1000)
    end = round(rate * float(item["endMs"]) / 1000)
    clip = [float(sample) for sample in samples[start:end]]
    if not clip:
        raise ValueError(f"empty crop for {item['id']}")

    dc_offset = sum(clip) / len(clip)
    clip = [sample - dc_offset for sample in clip]
    fade_in_ms = float(item.get("fadeInMs", 4))
    fade_out_ms = float(item.get("fadeOutMs", 18))
    silence_tail_ms = float(item.get("silenceTailMs", 8))
    target_peak = float(item.get("targetPeak", 32767 * 0.90))
    raised_cosine_fades(clip, rate, fade_in_ms, fade_out_ms)
    peak = max(abs(sample) for sample in clip)
    gain = min(12.0, target_peak / max(1.0, peak))
    encoded = [int(max(-32768, min(32767, round(sample * gain)))) for sample in clip]
    encoded.extend([0] * round(rate * silence_tail_ms / 1000))

    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(struct.pack(f"<{len(encoded)}h", *encoded))

    return {
        "id": item["id"],
        "char": item["char"],
        "durationMs": round(len(encoded) / rate * 1000, 1),
        "peak": max(abs(sample) for sample in encoded),
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    }


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: extract-human-consonants.py SOURCE_DIR OUTPUT_DIR")
    source_dir = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    results = []
    for item in manifest:
        source = source_dir / str(item["sourceFile"])
        if not source.exists():
            source = source_dir / f"{item['id']}.wav"
        output = output_dir / f"{item['id']}.wav"
        results.append(write_clip(source, output, item))
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
