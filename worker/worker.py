"""Flotion Mastering — queue worker.

Runs on the Oracle Cloud Always Free VPS (or any Linux box). Polls the
Cloudflare Worker for pending mastering jobs, downloads the source from
R2 (via the Cloudflare Worker proxy), runs the mastering pipeline, and
uploads the MP3 preview + 24-bit WAV master back.

The mastering pipeline is the one in lofi-studio (suno_mixer + the
multi-pass loop + smooth-gain limiter + final fade-out). The
anti-detection obscure chain is DISABLED here — that lives only in
personal renders, never in customer output.

Environment variables (set in ~/.flotion-worker.env or systemd unit):
    FLOTION_API_URL          e.g. https://flotionrecords.com
    WORKER_SHARED_SECRET     same value as on Cloudflare side
    LOFI_STUDIO_PATH         path to a checkout of the lofi-studio repo
    POLL_INTERVAL_SECONDS    default 15

Run:
    python worker.py
"""

import os
import sys
import time
import math
import tempfile
import traceback
from pathlib import Path

import requests


API_URL = os.environ.get("FLOTION_API_URL", "https://flotionrecords.com").rstrip("/")
SECRET  = os.environ.get("WORKER_SHARED_SECRET", "")
POLL    = int(os.environ.get("POLL_INTERVAL_SECONDS", "15"))
LOFI    = Path(os.environ.get("LOFI_STUDIO_PATH", "")).expanduser().resolve()

if not SECRET:
    print("ERROR: WORKER_SHARED_SECRET not set", file=sys.stderr); sys.exit(1)
if not LOFI.exists():
    print(f"ERROR: LOFI_STUDIO_PATH not found: {LOFI}", file=sys.stderr); sys.exit(1)

sys.path.insert(0, str(LOFI))

# Import the mastering pipeline. Customer masters run the FULL lofi-studio
# pipeline, including the inaudible finishing chain (humanising / AI-artefact
# cleanup). No stages are disabled — this is exactly what lofi-studio does.
import suno_mixer
import suno_multipass  # noqa: F401  (kept for measure() + parity with studio)


HEADERS = {"Authorization": f"Bearer {SECRET}"}


def poll_job():
    r = requests.post(f"{API_URL}/api/worker/poll", headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json().get("job")


def fetch_source(job_id, dest):
    with requests.get(f"{API_URL}/api/worker/fetch-source/{job_id}", headers=HEADERS, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=64 * 1024):
                if chunk:
                    f.write(chunk)


def upload_result(job_id, kind, path):
    ct = "audio/mpeg" if kind == "mp3" else "audio/wav"
    with open(path, "rb") as f:
        r = requests.put(
            f"{API_URL}/api/worker/upload-result/{job_id}/{kind}",
            headers={**HEADERS, "Content-Type": ct},
            data=f, timeout=300,
        )
    r.raise_for_status()


def report_done(job_id, ok, report=None, error=None):
    requests.post(
        f"{API_URL}/api/worker/complete",
        headers={**HEADERS, "Content-Type": "application/json"},
        json={"job_id": job_id, "ok": bool(ok), "report": report, "error_message": error},
        timeout=30,
    )


def measure(path):
    """Quick LUFS / peak / crest measurement using suno_multipass helpers."""
    try:
        import numpy as np
        import soundfile as sf
        y, sr = sf.read(str(path), always_2d=True)
        if y.dtype != "float32":
            y = y.astype("float32")
        lufs = float(suno_multipass._measure_lufs(y, sr))
        peak = float(np.max(np.abs(y)) + 1e-12)
        peak_db = 20 * math.log10(peak)
        mono = y.mean(axis=1) if y.ndim == 2 else y
        rms = float((mono ** 2).mean() ** 0.5 + 1e-12)
        crest = 20 * math.log10(peak / rms)
        return {"lufs": round(lufs, 2), "peak_db": round(peak_db, 2), "crest_db": round(crest, 2)}
    except Exception as e:
        return {"error": str(e)}


def process_one(job, workdir):
    job_id = job["id"]
    genre = job["genre"] or "auto"

    src_path = workdir / "source.wav"
    fetch_source(job_id, src_path)

    before = measure(src_path)

    # Decide preset
    preset = genre
    if preset == "auto" or preset not in suno_mixer.GENRE_PRESETS:
        preset = pick_preset_auto(src_path)

    # AI-artefact cleanup BEFORE mastering. Convert any input to WAV, run
    # the adaptive cleanup (de-harsh, dynamic de-mud, warmth) on the raw
    # source, then master the cleaned audio. The A/B player still compares
    # the customer's ORIGINAL (source.mp3) against this cleaned + mastered
    # result, so the improvement is what they hear.
    clean_wav = workdir / "source_clean.wav"
    to_master = src_path
    try:
        import suno_aiclean
        import soundfile as sf
        conv_wav = workdir / "source_conv.wav"
        rc = os.system(
            f'ffmpeg -y -v error -i "{src_path}" -ar 44100 -ac 2 -c:a pcm_s24le "{conv_wav}"'
        )
        if rc == 0 and conv_wav.exists():
            y, sr = sf.read(str(conv_wav), always_2d=True)
            crep = suno_aiclean.cleanup_report(y.astype("float32"), sr)
            print(f"  ai-cleanup: harsh {crep['harsh_ratio']}dB -> cut {crep['harsh_cut']}dB")
            y = suno_aiclean.ai_cleanup(y.astype("float32"), sr, strength=1.0)
            sf.write(str(clean_wav), y, sr, subtype="PCM_24")
            if clean_wav.exists():
                to_master = clean_wav
    except Exception as e:
        print(f"  ai-cleanup skipped ({e})")

    # Process (master the cleaned source)
    master_wav = workdir / "master.wav"
    result = suno_mixer.process_track(
        str(to_master), str(master_wav), preset,
        log_cb=lambda m: print(f"  {m}"),
        skip_dedup=True,
    )
    if not result.get("success"):
        raise RuntimeError(result.get("error") or "mastering failed")

    after = measure(master_wav)

    # Render MP3 preview of the master using ffmpeg
    mp3_path = workdir / "master.mp3"
    rc = os.system(
        f'ffmpeg -y -v error -i "{master_wav}" -codec:a libmp3lame -q:a 1 -map_metadata -1 '
        f'-metadata title="Flotion Mastered Preview" "{mp3_path}"'
    )
    if rc != 0 or not mp3_path.exists():
        raise RuntimeError("MP3 encode failed")

    # Also render an MP3 preview of the ORIGINAL source so the A/B
    # player on the result page can stream both sides quickly without
    # downloading the (possibly 50 MB) raw WAV.
    source_mp3 = workdir / "source.mp3"
    os.system(
        f'ffmpeg -y -v error -i "{src_path}" -codec:a libmp3lame -q:a 2 -map_metadata -1 '
        f'-metadata title="Flotion Source Preview" "{source_mp3}"'
    )
    if source_mp3.exists():
        upload_result(job_id, "source-mp3", source_mp3)

    upload_result(job_id, "mp3", mp3_path)
    upload_result(job_id, "wav", master_wav)

    report = {
        "preset": preset,
        "before_lufs": before.get("lufs"),
        "after_lufs": after.get("lufs"),
        "before_peak": before.get("peak_db"),
        "after_peak": after.get("peak_db"),
        "before_crest": before.get("crest_db"),
        "after_crest": after.get("crest_db"),
        "score": result.get("score"),
    }
    report_done(job_id, ok=True, report=report)


def pick_preset_auto(src_path):
    """Simple spectral classifier. Returns a preset key."""
    try:
        import numpy as np
        import soundfile as sf
        y, sr = sf.read(str(src_path), always_2d=True)
        mono = y.mean(axis=1).astype("float32") if y.ndim == 2 else y.astype("float32")
        from scipy.signal import welch
        f, Pxx = welch(mono, fs=sr, nperseg=8192)

        def band(lo, hi):
            m = (f >= lo) & (f <= hi)
            return float(Pxx[m].mean()) if m.any() else 0.0

        sub  = band(30, 80)
        bass = band(80, 200)
        mid  = band(500, 2000)
        hi   = band(8000, 14000)

        ratio_sub_to_mid = sub / (mid + 1e-12)
        # Quick heuristic
        if ratio_sub_to_mid > 1.5 and sub > bass * 0.7:
            return "edm_bigroom"
        if sub > mid * 2 and hi > mid * 0.4:
            return "uk_garage"
        if sub > mid * 1.2 and hi > mid * 0.6:
            return "ibiza_house"
        if hi < mid * 0.2 and sub < bass * 0.5:
            return "solo_piano"
        return "pop"
    except Exception:
        return "pop"


def main():
    print(f"Flotion worker started. API: {API_URL}  studio: {LOFI}")
    while True:
        try:
            job = poll_job()
            if not job:
                time.sleep(POLL); continue
            print(f"Processing job {job['id']} (genre={job['genre']})")
            with tempfile.TemporaryDirectory(prefix="flotion_") as td:
                try:
                    process_one(job, Path(td))
                    print(f"  done {job['id']}")
                except Exception as e:
                    traceback.print_exc()
                    report_done(job["id"], ok=False, error=str(e)[:500])
        except Exception as e:
            print(f"poll error: {e}")
            time.sleep(POLL)


if __name__ == "__main__":
    main()
