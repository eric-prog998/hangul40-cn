# Human consonant-onset audio

The 18 WAV files in `public/audio/consonant-human-onset/` are edited excerpts
of Korean pronunciation recordings by the native Korean speaker **호로조
(Jeebeen)**. They are not oscillator-generated or text-to-speech audio.

- Source collection: <https://commons.wikimedia.org/wiki/Category:Lingua_Libre_pronunciation_by_호로조>
- Speaker profile: <https://ko.wikisource.org/wiki/사용자:Jeebeen>
- License on every source recording: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Per-file source pages, SHA-256 hashes, and crop boundaries:
  `data/consonant-human-clips.json`

Each original is a 48 kHz, mono, 16-bit PCM WAV. To prevent coarticulation
distortion from rounded (`ㅜ`, `ㅗ`, `ㅟ`) or palatalizing (`ㅣ`, `ㅕ`) vowels—in
particular avoiding alveolo-palatal `[ɕ͈]` from `씨` for `ㅆ` and lip-rounded
onsets from `숲`, `귀`, `쥐`, `코`, `둘`, `봄`, `문`, and `풀`—all 18 clips are
extracted from neutral, unrounded `+ ㅏ` (`가다`, `까다`, `나`, `다리`, `따르다`,
`라오스`, `마늘`, `바다`, `빨다`, `사다`, `싸우다`, `자다`, `짜다`, `차`, `타다`,
`파다`, `하나`) or `+ ㅡ` (`크다`) words by the same speaker.

The published clip keeps the real release burst, friction, aspiration, nasal
murmur, or tongue tap while removing the steady vowel and the rest of the
source word. Crop boundaries, raised-cosine fades, silent tails, and peak
targets are tuned per clip so the speaker's real articulation remains clear
without playing a complete syllable; no synthetic sound is mixed in.

Tense obstruents (`ㄲ`, `ㄸ`, `ㅃ`, `ㅉ`) and the initial tap `ㄹ` retain a brief
pre-release closure and faded locus onset (`72–80 ms` total, `28500` peak
target) so the articulation is audible without speaking a full `ㅏ` vowel.

These clips are **human consonant onsets**, not standalone dictionary words.
Korean stops and the initial tap `ㄹ` cannot be naturally sustained on their
own, and modern Seoul Korean three-way stop contrasts (`ㄱ/ㄲ/ㅋ`, `ㄷ/ㄸ/ㅌ`,
`ㅂ/ㅃ/ㅍ`, `ㅈ/ㅉ/ㅊ`) also rely on voice onset time and pitch (`F0`) at the
start of the following vowel. Initial `ㅇ` remains truly silent and therefore
has no file.

The deterministic extraction script is `scripts/extract-human-consonants.py`.
It verifies every original source hash before writing a clip.
