"""Regression test for ONNX Runtime rejecting symlinked HF model sidecars."""
import tempfile
import unittest
from pathlib import Path

from tts_model import REQUIRED_FILES, materialize_model


class ModelPreparationTests(unittest.TestCase):
    def make_snapshot(self, root, revision):
        root = Path(root)
        snapshot = root / "snapshots" / revision
        blobs = root / "blobs"
        blobs.mkdir(exist_ok=True)
        required = list(REQUIRED_FILES) + [
            "onnx/codec/moss_audio_tokenizer_decode_shared.data",
            "voices/maichi/voice.npz",
        ]
        for index, relative in enumerate(required):
            blob = blobs / f"{revision}-{index}"
            blob.write_bytes((revision + relative).encode())
            link = snapshot / relative
            link.parent.mkdir(parents=True, exist_ok=True)
            link.symlink_to(blob)
        return snapshot, required

    def test_hf_cache_symlinks_become_regular_files_and_reuse_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, files = self.make_snapshot(tmp, "commit-a")
            dest = Path(tmp) / "data" / "zerotts-model"
            assert (src / files[-2]).is_symlink()
            result = materialize_model(src, dest)
            self.assertEqual(result, dest)
            for relative in files:
                self.assertTrue((dest / relative).is_file(), relative)
                self.assertFalse((dest / relative).is_symlink(), relative)
                self.assertEqual((dest / relative).read_bytes(),
                                 (src / relative).read_bytes())
            (dest / "sentinel.txt").write_text("keep")
            self.assertEqual(materialize_model(src, dest), dest)
            self.assertEqual((dest / "sentinel.txt").read_text(), "keep")

    def test_revision_change_rebuilds_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            src_a, _ = self.make_snapshot(tmp, "old")
            dest = Path(tmp) / "app" / "zerotts"
            materialize_model(src_a, dest)
            src_b, _ = self.make_snapshot(tmp, "new")
            materialize_model(src_b, dest)
            self.assertIn(b"new", (dest / "config.json").read_bytes())
            self.assertNotIn(b"old", (dest / "config.json").read_bytes())

    def test_regular_model_is_used_without_copying(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "real-model"
            for relative in REQUIRED_FILES:
                file = src / relative
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text("normal file")
            dest = Path(tmp) / "prepared"
            self.assertEqual(materialize_model(src, dest), src.resolve())
            self.assertFalse(dest.exists())

    def test_incomplete_model_fails_cleanly(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(FileNotFoundError):
                materialize_model(Path(tmp), Path(tmp) / "prepared")


if __name__ == "__main__":
    unittest.main()
