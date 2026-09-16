# Hangul 40 · Chinese Edition

Learn the 40 Hangul letters (한글 40음) as a Chinese speaker — with native-speaker
consonant audio, syllable-assembly drills, and five mini-games.

- **Live site:** https://hangul40-cn-eric0716.ericlll1.chatgpt.site/
- **中文说明:** [README.zh-CN.md](README.zh-CN.md)

## Why this exists

Korean-learning material for Chinese speakers is almost entirely locked inside paid,
closed apps. There is no open dataset that pairs the 40 Hangul jamo with pronunciation
rules, native-speaker audio, and Simplified Chinese explanations. This project is an
attempt at that missing layer, and the data files are structured so other apps can
reuse them.

The learner it is built for is a young K-pop fan who wants to read Hangul in a week —
not a linguistics student.

## Features

- Learning cards for all 19 consonants and 21 vowels.
- **Real native-speaker consonant onsets.** 18 consonants play WAV clips recorded by a
  Korean native speaker. `ㅇ` stays silent in onset position, as it should, and is only
  voiced as `[ŋ]` in the coda.
- **Syllable-assembly workshop.** Pick an onset and a vowel, hear the actual combined
  syllable rather than a synthesised approximation.
- Word and sentence decks with audio, plus a ten-question memory run.
- Five mini-games: listening discrimination, shadowing, matching, syllable assembly,
  and a 30-second speed read.
- Weighted review of missed items, daily XP, streaks, mastery state, and a seven-day
  history.
- Full keyboard control — `1`–`4` / `ASDF` to answer, `Space` or `R` to replay,
  `←` / `→` to switch games, `?` for the shortcut sheet.
- No account and no server-side database. Progress lives in `localStorage`.

## Tech stack

Next.js 16 and React 19 on Vite (`vinext`), Tailwind CSS 4, Drizzle ORM, deployed to
Cloudflare Workers. Requires Node.js `>=22.13.0`.

## Layout

```text
app/
  page.tsx                    page content, learning data, pronunciation logic, games
  globals.css                 styling and responsive layout
  layout.tsx                  title, description, favicon
data/
  consonant-names.json        consonant names, IPA, audio mapping, ㅇ silence rule
  consonant-human-clips.json  source recordings and cut metadata for the WAV onsets
  phrases.json                word and sentence bank
public/audio/
  consonant-human-onset/      18 native-speaker consonant onsets (WAV)
  hangul-natural/             vowel and syllable audio (MP3)
  phrases/                    word and sentence audio (MP3)
tests/
  rendered-html.test.mjs      regression tests for content, audio assets, advancement
scripts/
  extract-human-consonants.py reproducible onset extraction from the CC0 sources
```

## Local development

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

`npm test` runs a production build and then checks page content, the 19 consonant
names, the 18 native-speaker WAV files, key audio assets, auto-advancement, and the
keyboard logic. `npm run lint` is available separately.

## Pronunciation rules that must not break

These are load-bearing; a change that violates one is a regression even if tests pass:

1. One click plays exactly one sound. A shared `activeAudio` handle stops the previous
   clip.
2. One answer advances exactly one question.
3. Consonant onsets come from the WAV files, never from oscillator synthesis, and never
   from faking a bare consonant with "consonant + ㅏ".
4. Mouse, touch, and keyboard all stay usable.

## Audio licensing

The 18 native-speaker consonant onsets are cut from pronunciation recordings by the
Korean native speaker 호로조 (Jeebeen), published on Wikimedia Commons / Lingua Libre
under **CC0 1.0**. Per-file source URLs, SHA-256 hashes, and exact cut ranges are
recorded in `data/consonant-human-clips.json`; `HUMAN_CONSONANT_AUDIO.md` documents the
full provenance and `scripts/extract-human-consonants.py` reproduces the extraction.

Code is MIT licensed (see [LICENSE](LICENSE)). The CC0 audio keeps its own terms.

## Status

Early, and honest about it. The source published here is v13; the live site runs a
later iteration, and there is one maintainer. Issues and pull requests are welcome.
