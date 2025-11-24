import json
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import app


class TestTechStackConfiguration(unittest.TestCase):
    def setUp(self):
        self.project_root = Path(__file__).resolve().parents[2]

    def test_requirements_contains_core_packages(self):
        requirements = self.project_root / "requirements.txt"
        self.assertTrue(requirements.is_file(), "requirements.txt should exist at project root")

        content = requirements.read_text().splitlines()
        expected_packages = {"fastapi", "uvicorn[standard]", "supabase", "redis", "celery", "yt-dlp", "ffmpeg-python"}
        present_packages = {line.split("==")[0] for line in content if line and not line.startswith("#")}

        for package in expected_packages:
            with self.subTest(package=package):
                self.assertIn(package, present_packages, f"{package} should be pinned in requirements.txt")

    def test_docker_compose_defines_services(self):
        compose = self.project_root / "docker-compose.yml"
        self.assertTrue(compose.is_file(), "docker-compose.yml should exist")

        text = compose.read_text()
        for service_name in ["api:", "worker:", "redis:"]:
            with self.subTest(service=service_name):
                self.assertIn(service_name, text, f"{service_name} should be defined in docker-compose.yml")

        self.assertIn("health", text, "Health checks should be configured for services")

    def test_frontend_package_json(self):
        package_json = self.project_root / "frontend" / "package.json"
        self.assertTrue(package_json.is_file(), "frontend/package.json should exist")

        data = json.loads(package_json.read_text())
        dependencies = data.get("dependencies", {})
        self.assertIn("next", dependencies)
        self.assertIn("react", dependencies)
        self.assertIn("react-dom", dependencies)

    def test_health_endpoint(self):
        client = TestClient(app)
        response = client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"service": "api", "status": "ok"})


if __name__ == "__main__":
    unittest.main()
