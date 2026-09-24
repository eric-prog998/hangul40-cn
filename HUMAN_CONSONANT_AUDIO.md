# Human consonant-onset audio

The 18 WAV files in `public/audio/consonant-human-onset/` are edited excerpts
of Korean pronunciation recordings by the native Korean speaker **호로조
(Jeebeen)**. They are not oscillator-generated or text-to-speech audio.

- Source collection: <https://commons.wikimedia.org/wiki/Category:Lingua_Libre_pronunciation_by_호로조>
- Speaker profile: <https://ko.wikisource.org/wiki/사용자:Jeebeen>
- License on every source recording: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Per-file source pages, SHA-256 hashes, and crop boundaries:
  `data/consonant-human-clips.json`

Each original is a 48 kHz, mono, 16-bit PCM WAV. The published clip keeps the
real release burst, friction, aspiration, nasal murmur, or tongue tap. The full
vowel and the rest of the source word are removed. Crop boundaries, fades,
silent tails, and peak targets are tuned per clip where needed so the speaker's
real articulation remains audible without playing a complete vowel or
syllable. Defaults are a 4 ms raised-cosine fade-in, an 18 ms fade-out, an 8 ms
silent tail, and 90% peak normalization; no synthetic sound is mixed in.

In v14, `ㄹ`, `ㄸ`, and `ㄲ` use new excerpts from `라오스`, `따르다`, and
`까다` by the same speaker. Their longer 75/87/87 ms clips retain more of the
real tongue-tap or pre-release closure, apply a gentler 25/24/24 ms fade-out,
and use a 26000 peak target. The extra time is not a repeated sound or a hidden
`ㅏ` syllable.

These clips are best described as **human consonant onsets**, not as complete
independent utterances. Korean stops and the initial tap `ㄹ` cannot be
naturally sustained on their own, and modern Seoul Korean stop contrasts also
use cues at the beginning of the following vowel. Initial `ㅇ` remains truly
silent and therefore has no file.

The deterministic extraction script is
`scripts/extract-human-consonants.py`. It verifies every original source hash
before writing a clip.
