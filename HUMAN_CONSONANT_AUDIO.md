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
vowel and the rest of the source word are removed. A maximum of 35 ms of the
voice-onset transition is retained and faded out so the result keeps the
speaker's real articulation without playing a complete vowel or syllable.
The crop has a 4 ms raised-cosine fade-in, an 18 ms fade-out, an 8 ms silent
tail, and peak normalization only; no synthetic sound is mixed in.

These clips are best described as **human consonant onsets**, not as complete
independent utterances. Korean stops and the initial tap `ㄹ` cannot be
naturally sustained on their own, and modern Seoul Korean stop contrasts also
use cues at the beginning of the following vowel. Initial `ㅇ` remains truly
silent and therefore has no file.

The deterministic extraction script is
`scripts/extract-human-consonants.py`. It verifies every original source hash
before writing a clip.
