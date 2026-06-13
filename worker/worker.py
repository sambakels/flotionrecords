"""Flotion Mastering — queue worker.

Runs on the Oracle Cloud Always Free VPS (or any Linux box). Polls the
Cloudflare Worker for pending mastering jobs, downloads the source from
R2 (via the Cloudflare Worker proxy), runs the mastering pipeline, and
uploads the MP3 preview + 24-bit WAV master back.

The mastering pipeline is the one in lofi-studio (adaptive AI-artefact
cleanup -> multi-pass master -> smooth-gain limiter -> final fade-out).

CUSTOMER-SAFE configuration (see _configure_customer_safe_pipeline below):
the full anti-detection obscure chain (pitch shift, time warp, resample
roundtrip, HF noise, phase decorrelation) is NOT applied to customer
masters. Every one of those stages can add faint grain / shimmer / hiss,
and the A/B player would expose it. Customer finishing keeps only the
single genuinely inaudible watermark step: an ultrasonic notch above
19 kHz. Metadata watermarks are stripped at decode time regardless.
The personal lofi pipeline (separate Flask app) still runs the full
obscure stack on our own releases; only this worker is reconfigured.

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

# Import the mastering pipeline, then reconfigure it for customer-safe output.
import suno_mixer
import suno_multipass  # used for measure() + finishing-chain override


def _customer_safe_finishing(processed, sr, params, preset_key):
    """Customer finishing chain: ONLY the inaudible ultrasonic watermark notch.

    The personal lofi pipeline runs the full suno_obscure.obscure() stack to
    evade AI detectors on our OWN releases. None of that belongs on a track a
    customer PAID us to master: pitch shift, time warp, resample roundtrip, HF
    noise floor and phase decorrelation each can add faint grain / shimmer /
    hiss, and the A/B player would expose it, killing the sale. We keep the one
    operation that is genuinely inaudible to adults yet still removes a real
    watermark vector: a zero-phase bandstop in 19-22 kHz. Metadata watermarks
    are already stripped at decode time and the 24-bit writer stamps a clean
    INFO chunk, so the master is watermark-clean without touching anything the
    customer can hear.
    """
    try:
        import suno_obscure
        return suno_obscure.ultrasonic_notch(processed, sr, low=19000, high=22000)
    except Exception:
        return processed


def _configure_customer_safe_pipeline():
    """Monkey-patch the shared lofi modules so the customer path is clean.

    This worker is a SEPARATE process from the personal lofi-studio Flask app,
    so these patches never affect our own releases. They make four changes:

      1. Finishing chain -> inaudible watermark notch only (no obscure artefacts)
      2. Quality gate    -> never HARD-reject a paying customer's upload
      3. Catalog         -> do not write customer tracks into our lofi catalog
      4. Baseline        -> never train our learned presets on customer audio
    """
    import suno_gate
    import suno_catalog
    import suno_baseline

    # 1. Inaudible finishing only.
    suno_multipass._apply_finishing_chain = _customer_safe_finishing

    # 2. Lenient gate. Keep the measured metrics (they seed good starting
    #    params via baseline.resolve) but force pass=True so every upload gets
    #    mastered, even quiet / short / unusually bright ones. A customer who
    #    paid should always get a master back, not a hard "rejected".
    _orig_evaluate = suno_gate.evaluate

    def _lenient_gate(path, preset_key):
        try:
            res = dict(_orig_evaluate(path, preset_key))
        except Exception:
            return {"pass": True, "reason": "", "metrics": {}}
        if not res.get("pass"):
            res["pass"] = True
            res["reason"] = ""
        return res

    suno_gate.evaluate = _lenient_gate

    # 3. No catalog pollution. Return a valid-shaped throwaway assignment so
    #    master_track keeps working, but write nothing to the personal catalog.
    def _no_catalog(genre, source_name, master_path, preview_path, score_value):
        return {
            "catalog_id": "CUSTOMER", "album_id": "", "album_label": "Customer",
            "album_volume": 0, "slot_index": 0, "album_full": False, "target_size": 1,
        }

    suno_catalog.assign = _no_catalog

    # 4. No baseline learning from customer tracks.
    suno_baseline.update = lambda *a, **k: None


_configure_customer_safe_pipeline()


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


def run_cleanup():
    """Ask the API to purge free, unpaid jobs older than 48h (R2 + DB)."""
    try:
        r = requests.post(f"{API_URL}/api/worker/cleanup", headers=HEADERS, timeout=60)
        if r.ok:
            n = r.json().get("deleted", 0)
            if n:
                print(f"  cleanup: removed {n} expired free jobs")
    except Exception as e:
        print(f"  cleanup error: {e}")


# --- On-demand download formats -------------------------------------------
# The customer can pick a format/rate on the result screen. The worker
# renders it once from the stored 24-bit master and caches it in R2.
TRANSCODE_FFARGS = {
    "wav24": ["-c:a", "pcm_s24le"],
    "wav16": ["-c:a", "pcm_s16le"],   # ffmpeg auto-dithers on bit-depth reduction
    "flac":  ["-c:a", "flac"],
    "mp3":   ["-c:a", "libmp3lame", "-b:a", "320k"],
}
TRANSCODE_EXT = {"wav24": "wav", "wav16": "wav", "flac": "flac", "mp3": "mp3"}
TRANSCODE_CT = {"wav24": "audio/wav", "wav16": "audio/wav", "flac": "audio/flac", "mp3": "audio/mpeg"}


def poll_transcode():
    r = requests.post(f"{API_URL}/api/worker/poll-transcode", headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json().get("transcode")


def fetch_master(job_id, dest):
    with requests.get(f"{API_URL}/api/worker/fetch-master/{job_id}", headers=HEADERS, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=64 * 1024):
                if chunk:
                    f.write(chunk)


def upload_variant(transcode_id, path, content_type):
    with open(path, "rb") as f:
        r = requests.put(
            f"{API_URL}/api/worker/upload-variant/{transcode_id}",
            headers={**HEADERS, "Content-Type": content_type},
            data=f, timeout=300,
        )
    r.raise_for_status()


def report_transcode_failed(transcode_id):
    try:
        requests.put(f"{API_URL}/api/worker/upload-variant/{transcode_id}?ok=0", headers=HEADERS, timeout=30)
    except Exception:
        pass


def process_transcode(t, workdir):
    tid, fmt, sr = t["id"], t["fmt"], int(t["sr"])
    args = TRANSCODE_FFARGS.get(fmt)
    if not args:
        report_transcode_failed(tid); return
    master = workdir / "master_src.wav"
    fetch_master(t["job_id"], master)
    out = workdir / f"variant.{TRANSCODE_EXT[fmt]}"
    cmd = (
        f'ffmpeg -y -v error -i "{master}" -map_metadata -1 -ar {sr} '
        + " ".join(args) + f' "{out}"'
    )
    rc = os.system(cmd)
    if rc != 0 or not out.exists():
        report_transcode_failed(tid); return
    upload_variant(tid, out, TRANSCODE_CT[fmt])


def main():
    print(f"Flotion worker started. API: {API_URL}  studio: {LOFI}")
    last_cleanup = 0.0
    while True:
        try:
            # Run cleanup about once an hour.
            if time.time() - last_cleanup > 3600:
                run_cleanup()
                last_cleanup = time.time()

            job = poll_job()
            if job:
                print(f"Processing job {job['id']} (genre={job['genre']})")
                with tempfile.TemporaryDirectory(prefix="flotion_") as td:
                    try:
                        process_one(job, Path(td))
                        print(f"  done {job['id']}")
                    except Exception as e:
                        traceback.print_exc()
                        report_done(job["id"], ok=False, error=str(e)[:500])
                continue

            # No mastering job pending — render a download format if requested.
            t = poll_transcode()
            if t:
                print(f"Transcoding {t['fmt']} @ {t['sr']}Hz for job {t['job_id']}")
                with tempfile.TemporaryDirectory(prefix="flotion_tc_") as td:
                    try:
                        process_transcode(t, Path(td))
                        print(f"  variant done {t['id']}")
                    except Exception as e:
                        traceback.print_exc()
                        report_transcode_failed(t["id"])
                continue

            time.sleep(POLL)
        except Exception as e:
            print(f"poll error: {e}")
            time.sleep(POLL)


if __name__ == "__main__":
    main()
