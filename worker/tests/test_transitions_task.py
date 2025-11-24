import os
import subprocess
import tempfile
from pathlib import Path
from unittest import TestCase, mock

from worker.tasks import transitions


class TestTransitionBuilder(TestCase):
    def test_build_transition_filters_generates_offsets(self):
        filters, final_v, final_a = transitions.build_transition_filters(
            [5.0, 7.0, 4.0], "fadeblack", duration_seconds=1.5
        )

        self.assertEqual(final_v, "[v2]")
        self.assertEqual(final_a, "[a2]")
        filter_text = ";".join(filters)
        self.assertIn("xfade", filter_text)
        self.assertIn("offset=3.5", filter_text)
        self.assertIn("offset=9.0", filter_text)
        self.assertIn("acrossfade", filter_text)

    def test_cut_transition_uses_concat(self):
        filters, final_v, final_a = transitions.build_transition_filters(
            [3.0, 2.0], "cut", duration_seconds=1.0
        )
        self.assertIn("concat=n=2", ";".join(filters))
        self.assertEqual(final_v, "[vout]")
        self.assertEqual(final_a, "[aout]")


class TestMergeTask(TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.part1 = Path(self.temp_dir.name) / "part1.mp4"
        self.part2 = Path(self.temp_dir.name) / "part2.mp4"
        self.part1.write_text("clip1")
        self.part2.write_text("clip2")

    def test_merge_with_transitions_invokes_ffmpeg(self):
        commands = []

        def fake_run(command):
            commands.append(command)
            output_path = Path(command[-1])
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text("merged")
            return subprocess.CompletedProcess(command, 0)

        segments = [
            {"path": str(self.part1), "start": 0.0, "end": 5.0, "position": 0},
            {"path": str(self.part2), "duration": 4.0, "position": 1},
        ]

        with mock.patch.dict(os.environ, {"MERGE_ROOT": self.temp_dir.name}):
            with mock.patch("worker.tasks.transitions._run_ffmpeg", side_effect=fake_run):
                output = transitions.merge_with_transitions(
                    youtube_id="abc123", segments=segments, transition="slide", job_id="job-1"
                )

        self.assertTrue(Path(output).exists())
        self.assertEqual(len(commands), 1)
        filter_idx = commands[0].index("-filter_complex")
        filter_arg = commands[0][filter_idx + 1]
        self.assertIn("xfade", filter_arg)
        self.assertIn("acrossfade", filter_arg)
        self.assertIn("slideleft", filter_arg)

    def test_merge_command_single_clip_uses_copy(self):
        command, output = transitions.merge_command(
            [{"path": str(self.part1), "duration": 2.5}], transition="fade"
        )
        self.assertIn("copy", command)
        self.assertTrue(str(output).endswith("merged.mp4"))
