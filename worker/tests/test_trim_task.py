import os
import subprocess
import tempfile
from pathlib import Path
from typing import List
from unittest import TestCase, mock

from worker.tasks import trim


class DummySupabaseTable:
    def __init__(self, name: str, sink: List[dict]):
        self.name = name
        self.sink = sink
        self.current = {}

    def update(self, values: dict):
        self.current["values"] = values
        return self

    def eq(self, column: str, value: str):
        self.current["filter"] = {"column": column, "value": value, "table": self.name}
        self.sink.append(self.current)
        return self

    def execute(self):
        return {"data": [self.current]}


class DummySupabase:
    def __init__(self):
        self.records: List[dict] = []

    def table(self, name: str):
        return DummySupabaseTable(name, self.records)


class TestTrimTask(TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.input_video = Path(self.temp_dir.name) / "source.mp4"
        self.input_video.write_text("dummy video")

    def test_trim_segments_uses_fast_copy_and_writes_parts(self):
        calls = []

        def fake_run(command):
            calls.append(command)
            output_path = Path(command[-1])
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text("trimmed")
            return subprocess.CompletedProcess(command, 0)

        segments = [
            {"id": "seg-1", "start": 1.0, "end": 5.0, "position": 1},
            {"id": "seg-2", "start": 10.0, "end": 20.0, "position": 2},
        ]

        with mock.patch.dict(os.environ, {"TRIM_ROOT": self.temp_dir.name}):
            with mock.patch("worker.tasks.trim._run_ffmpeg", side_effect=fake_run):
                supabase = DummySupabase()
                outputs = trim.trim_segments(
                    youtube_id="abc123",
                    input_path=str(self.input_video),
                    segments=segments,
                    supabase_client=supabase,
                )

        self.assertEqual(len(outputs), 2)
        self.assertTrue(Path(outputs[0]).exists())
        self.assertTrue(Path(outputs[1]).exists())
        self.assertTrue(all("-c" in cmd for cmd in calls))
        self.assertEqual(len(supabase.records), 2)

    def test_trim_segments_falls_back_to_reencode_on_failure(self):
        commands = []

        def failing_then_success(command):
            commands.append(command)
            output_path = Path(command[-1])
            if len(commands) == 1:
                raise subprocess.CalledProcessError(1, command)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text("reencoded")
            return subprocess.CompletedProcess(command, 0)

        with mock.patch.dict(os.environ, {"TRIM_ROOT": self.temp_dir.name}):
            with mock.patch("worker.tasks.trim._run_ffmpeg", side_effect=failing_then_success):
                outputs = trim.trim_segments(
                    youtube_id="xyz789",
                    input_path=str(self.input_video),
                    segments=[{"start": 0, "end": 2.5, "position": 0}],
                )

        self.assertEqual(len(outputs), 1)
        self.assertTrue(Path(outputs[0]).exists())
        self.assertEqual(len(commands), 2)
        self.assertIn("libx264", commands[1])
