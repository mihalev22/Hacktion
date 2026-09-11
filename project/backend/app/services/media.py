"""Подготовка медиафайла к STT: аудио уходит как есть, из видео извлекается
аудиодорожка через FFmpeg. Дальше работает существующий pipeline без изменений.

        ┌→ AUDIO ────────────────→ STT ┐
UPLOAD ─┤                              ├→ TRANSCRIPT → AI → ТЗ
        └→ VIDEO → FFmpeg(.wav) → STT ┘
"""
import shutil
import subprocess
import tempfile
from pathlib import Path

AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
VIDEO_EXT = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

EXTRACT_TIMEOUT_SEC = 1800
PROBE_TIMEOUT_SEC = 60


class MediaError(RuntimeError):
    """Понятная пользователю ошибкаMedia (без traceback)."""


def detect_kind(path: Path) -> str | None:
    """'audio' | 'video' | None. Снифф магических байтов строго под заявленное расширение:
    'RIFFfake.mp3' больше не пройдёт как аудио, .wav без WAVE-заголовка — тоже."""
    ext = path.suffix.lower()
    try:
        with path.open("rb") as fh:  # не держим handle: на Windows он блокирует unlink
            head = fh.read(16)
    except OSError:
        return None
    if len(head) < 12:
        return None
    is_ftyp = head[4:8] == b"ftyp"                                  # mp4/mov/m4a контейнер
    is_ebml = head[:4] == b"\x1aE\xdf\xa3"                          # webm/mkv
    is_avi = head[:4] == b"RIFF" and head[8:12] == b"AVI "
    is_wav = head[:4] == b"RIFF" and head[8:12] == b"WAVE"
    is_mp3 = head[:3] == b"ID3" or (head[0] == 0xFF and head[1] & 0xE0 == 0xE0)
    is_adts = head[0] == 0xFF and head[1] & 0xF6 == 0xF0            # aac
    is_flac = head[:4] == b"fLaC"
    is_ogg = head[:4] == b"OggS"

    audio_by_ext = {".mp3": is_mp3, ".wav": is_wav, ".m4a": is_ftyp or is_adts,
                    ".aac": is_adts or is_ftyp, ".ogg": is_ogg, ".flac": is_flac}
    video_by_ext = {".mp4": is_ftyp, ".mov": is_ftyp, ".webm": is_ebml, ".mkv": is_ebml, ".avi": is_avi}
    if ext in audio_by_ext:
        return "audio" if audio_by_ext[ext] else None
    if ext in video_by_ext:
        return "video" if video_by_ext[ext] else None
    return None


def workdir() -> Path:
    return Path(tempfile.mkdtemp(prefix="xtz_media_"))


def ensure_ffmpeg() -> None:
    if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
        raise MediaError("На сервере не установлен FFmpeg — установите его и перезапустите backend")


def has_audio_stream(path: Path) -> bool:
    probe = shutil.which("ffprobe")
    r = subprocess.run(
        [probe, "-v", "error", "-select_streams", "a",
         "-show_entries", "stream=codec_type", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, timeout=PROBE_TIMEOUT_SEC)
    if r.returncode != 0:
        raise MediaError("Не удалось прочитать файл. Попробуйте другой файл")
    return "audio" in r.stdout


def extract_audio(video_path: Path, tmp: Path) -> Path:
    """ffmpeg -i in -vn -ac 1 -ar 16000 out.wav → путь к WAV."""
    out = tmp / "audio.wav"
    r = subprocess.run(
        [shutil.which("ffmpeg"), "-y", "-i", str(video_path),
         "-vn", "-ac", "1", "-ar", "16000", str(out)],
        capture_output=True, text=True, timeout=EXTRACT_TIMEOUT_SEC)
    if r.returncode != 0 or not out.exists() or out.stat().st_size < 100:
        raise MediaError("Не удалось извлечь аудио из видео. Попробуйте другой файл")
    return out


def cleanup(tmp: Path | None) -> None:
    if tmp and tmp.exists():
        shutil.rmtree(tmp, ignore_errors=True)
