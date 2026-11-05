"""Prepare ZeroTTS weights as real files for ONNX Runtime on macOS.

Hugging Face snapshot cache uses symlinks into blobs/. Recent ONNX Runtime
validates external .data paths relative to an ONNX model's physical directory.
Because different model/sidecar files resolve to different cache blobs, ORT
rejects the external data even though the Hugging Face snapshot is complete.

Materialize the snapshot as regular files once. Never edit Hugging Face's cache.
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

REQUIRED_FILES = (
    "config.json",
    "onnx/text_encoder.onnx",
    "onnx/prefix_step.onnx",
    "onnx/local_frame_decode.onnx",
    "onnx/codec/codec_browser_onnx_meta.json",
)


def _check_model(directory: Path) -> None:
    missing = [name for name in REQUIRED_FILES if not (directory / name).is_file()]
    if missing:
        raise FileNotFoundError(
            f"ZeroTTS model at {directory} is incomplete, missing: {', '.join(missing)}"
        )


def _has_symlinks(directory: Path) -> bool:
    for root, dirs, files in os.walk(directory, followlinks=False):
        for name in dirs + files:
            if (Path(root) / name).is_symlink():
                return True
    return False


def materialize_model(source: str | Path, destination: str | Path) -> Path:
    """Return a model directory containing real files, not HF cache symlinks.

    The cached copy is reused when the snapshot path matches. Copying may use
    significant disk space, but happens once per model revision, not per launch.
    """
    source = Path(source).expanduser().resolve()
    destination = Path(destination).expanduser()
    _check_model(source)

    if not _has_symlinks(source):
        return source

    destination.parent.mkdir(parents=True, exist_ok=True)
    marker = destination / ".zerotts-source.json"
    if destination.is_dir() and marker.is_file():
        try:
            manifest = json.loads(marker.read_text(encoding="utf-8"))
            if manifest.get("source") == str(source):
                _check_model(destination)
                if not _has_symlinks(destination):
                    return destination
        except (OSError, ValueError, FileNotFoundError):
            pass

    temp = destination.with_name(destination.name + f".tmp-{os.getpid()}")
    if temp.exists():
        shutil.rmtree(temp)
    try:
        # symlinks=False dereferences HF cache links and copies regular data files.
        shutil.copytree(source, temp, symlinks=False)
        _check_model(temp)
        if _has_symlinks(temp):
            raise RuntimeError("ZeroTTS model preparation left symbolic links behind.")
        (temp / ".zerotts-source.json").write_text(
            json.dumps({"source": str(source)}, indent=2), encoding="utf-8"
        )
        if destination.exists():
            shutil.rmtree(destination)
        temp.rename(destination)
    finally:
        if temp.exists():
            shutil.rmtree(temp)
    return destination
