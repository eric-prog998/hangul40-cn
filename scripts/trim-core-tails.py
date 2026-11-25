"""Verify or apply the v51.3 lossless core-tail edit using the *v51.2* public directory.

On macOS, with Node 22+, Playwright Chromium and this project's dependencies installed:
  python3 scripts/trim-core-tails.py /path/to/pristine-v51.2/public --apply
  python3 scripts/trim-core-tails.py /path/to/pristine-v51.2/public --check

The v51.2 Git revision is f0a4a0e1937038bb56558b88f199e1d54e0144c5.
No TTS/re-encoding, requests, frame splicing or level thresholds. Validate every
candidate with Core Audio *and* Chromium float32 before writing any files.
"""
import argparse, array, hashlib, json, math, struct, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RATE, FRAME, PACKET = 24000, 576, 144
GUARD = RATE * 180 // 1000
TARGET_GUARD = RATE * 216 // 1000
BASELINE = "73df209d3672c556d6d8ba9a0ff5fc3451fb0be3194e9d4bb1ca073192266172"
digest = lambda b: hashlib.sha256(b).hexdigest()
def dump(obj):
    return (json.dumps(obj, ensure_ascii=False, indent=2) + "\n").encode()
def pcm(path, wav):
    subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEF32@24000", "-c", "1", str(path), str(wav)], check=True)
    buf = wav.read_bytes()
    if buf[:4] != b"RIFF" or buf[8:12] != b"WAVE": raise ValueError("not WAV")
    i, fmt = 12, None
    while i + 8 <= len(buf):
        tag, n = struct.unpack_from("<4sI", buf, i)
        data = buf[i+8:i+8+n]
        if len(data) != n: raise ValueError("malformed WAV")
        if tag == b"fmt ": fmt = struct.unpack_from("<HHIIHH", data)
        if tag == b"data" and fmt == (3,1,RATE,4*RATE,4,32): return data
        i += 8+n+(n%2)
    raise ValueError("missing mono float32 data")
def end_of_signal(raw):
    samples=array.array("f"); samples.frombytes(raw)
    if sys.byteorder != "little": samples.byteswap()
    if not all(math.isfinite(v) for v in samples): raise ValueError("non-finite audio")
    for i in range(len(samples)-1,-1,-1):
        if samples[i] != 0: return i+1
    raise ValueError("silent original")
def core_paths():
    codes = {0xac00+(11*21+v)*28 for v in range(21)} | {0xac00+i*21*28 for i in range(19)}
    return sorted("/audio/hangul-natural/s-%x.mp3"%c for c in codes)
def require(condition, message):
    if not condition: raise ValueError(message)
def browser_comparison(work,jobs):
    todo=work/"queue.json";todo.write_bytes(dump(jobs))
    return json.loads(subprocess.check_output(["node",str(ROOT/"scripts/core-tail-chromium.mjs"),str(todo)]))
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("original_public",type=Path); m=p.add_mutually_exclusive_group(required=True)
    m.add_argument("--check",action="store_true");m.add_argument("--apply",action="store_true"); args=p.parse_args()
    paths=core_paths()
    original={key:(args.original_public/key[1:]).resolve() for key in paths}
    old={key:path.read_bytes() for key,path in original.items()}
    require(digest("".join(k+" "+digest(old[k])+"\n" for k in paths).encode())==BASELINE,"need exact v51.2 set")
    fps_path=ROOT/"data/audio-fingerprints.json";fps=json.loads(fps_path.read_bytes())
    writes={}; changes={}; audit={}; jobs=[]
    with tempfile.TemporaryDirectory() as tmp:
        work=Path(tmp)
        for k in paths:
            src=original[k]; raw=old[k]; name=src.stem
            # Fixed-length, metadata-free MPEG-2 Layer III mono 48kbps/24kHz. Padding
            # and tag-bearing streams are outside this one-time recipe. Dropping suffix
            # frames cannot invalidate a retained frame's backward-pointing bit reservoir.
            require(len(raw)%PACKET==0 and all(raw[i:i+4]==bytes.fromhex("fff364c4")
                for i in range(0,len(raw),PACKET)) and not any(t in raw[:PACKET] for t in (b"Xing",b"Info",b"VBRI")), "unrecognised frames: "+k)
            pcm0=pcm(src,work/(name+"-old.wav")); n0=len(pcm0)//4; end=end_of_signal(pcm0)
            require(n0 == len(raw)//PACKET*FRAME, "unexpected Core Audio delay: "+k)
            frames=math.ceil((end+TARGET_GUARD)/FRAME)
            row=audit[k]=dict(original_sha256=digest(raw),original_ms=n0//24,original_samples=n0,coreaudio_last_nonzero_end=end)
            if n0-frames*FRAME < FRAME*5:
                row["status"]="unchanged-insufficient-exact-zero"; continue
            new=raw[:frames*PACKET]; candidate=work/(name+".mp3");candidate.write_bytes(new)
            pcm1=pcm(candidate,work/(name+"-new.wav")); n1=len(pcm1)//4
            require(n1 == frames*FRAME and pcm1 == pcm0[:len(pcm1)] and n1-end >= GUARD and n1<n0, "candidate PCM mismatch: "+k)
            row.update(coreaudio_new_samples=n1,coreaudio_prefix_f32le_sha256=digest(pcm1))
            jobs.append(dict(path=k,original=str(src),candidate=str(candidate)))
        other=browser_comparison(work,jobs)
        extended=[]
        for job in jobs:
            k=job["path"]; b=other[k]
            # Chromium and Core Audio occasionally disagree on the very last quiet
            # sample. Retain extra whole frames rather than compromise either guard.
            if not (b["prefix_exact"] and b["removed_exact_zero"] and b["retained_zero_samples"] < GUARD): continue
            cand=Path(job["candidate"]); extra=math.ceil((TARGET_GUARD-b["retained_zero_samples"])/FRAME)
            length=cand.stat().st_size+extra*PACKET
            if length>=len(old[k]): continue
            cand.write_bytes(old[k][:length]); stem=cand.stem
            pcm0=pcm(original[k],work/(stem+"-recheck-old.wav"))
            pcm1=pcm(cand,work/(stem+"-extended.wav")); n1=len(pcm1)//4
            require(n1==length//PACKET*FRAME and pcm1==pcm0[:len(pcm1)] and n1-end_of_signal(pcm0)>=GUARD,"extended PCM mismatch: "+k)
            audit[k].update(coreaudio_new_samples=n1,coreaudio_prefix_f32le_sha256=digest(pcm1))
            extended.append(job)
        if extended: other.update(browser_comparison(work,extended))
        for job in jobs:
            k=job["path"]; row=audit[k]; browser=other[k]
            row["chromium"]=browser
            if not (browser["prefix_exact"] and browser["removed_exact_zero"] and browser["retained_zero_samples"]>=GUARD):
                row["status"]="unchanged-browser-cannot-confirm";continue
            writes[k]=Path(job["candidate"]).read_bytes(); row["status"]="trimmed"
        for k in paths:
            row=audit[k]; new=writes.get(k,old[k]); row.update(sha256=digest(new),new_ms=len(new)//PACKET*24)
            if k in writes: changes[k]=row["sha256"]
            require(digest((ROOT/"public"/k[1:]).read_bytes()) in {row["original_sha256"],row["sha256"]}, "unexpected working copy: "+k)
            require(fps[k]["sha256"] in {row["original_sha256"],row["sha256"]}, "fingerprint conflict: "+k)
            fps[k]={"sha256":row["sha256"],"bytes":len(new)}
    outputs={ROOT/"public"/k[1:]:v for k,v in writes.items()}
    outputs.update({fps_path:dump(fps),ROOT/"data/core-tail-trims.json":dump(changes),ROOT/"scripts/core-tail-v513-audit.json":dump(audit)})
    for path, wanted in outputs.items():
        if path.is_file() and path.read_bytes()==wanted: continue
        if args.check: raise ValueError("generated output differs: "+str(path))
        path.write_bytes(wanted)
    print("Checked",len(paths),"originals; trimmed",len(writes),"using exact-zero suffixes and two decoders; retained",len(paths)-len(writes))
if __name__=="__main__": main()
