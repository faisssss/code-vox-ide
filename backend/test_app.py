"""Run with: python -m unittest test_app  (from the backend folder). No API key needed."""
import time
import unittest
from types import SimpleNamespace
from unittest import mock

import app as server


class CleanCode(unittest.TestCase):
    def test_keeps_valid_code_untouched(self):
        for code in ['python_version = 3\nprint(python_version)',
                     'def f():\n    """Add one."""\n    return 1',
                     "x = '''a\nb'''"]:
            self.assertEqual(server.clean_code(code), code)

    def test_removes_wrappers(self):
        self.assertEqual(server.clean_code("```python\nprint(1)\n```"), "print(1)")
        self.assertEqual(server.clean_code("```\nprint(1)\n```\n"), "print(1)")
        self.assertEqual(server.clean_code("python\nprint(1)"), "print(1)")


class Api(unittest.TestCase):
    def setUp(self):
        self.client = server.app.test_client()
        self.base = "http://localhost:5000"

    def tearDown(self):
        self.post("/api/stop", {})

    def post(self, path, body, **headers):
        return self.client.post(path, json=body, base_url=self.base, headers=headers)

    def run_until_done(self, code, timeout=20):
        self.assertEqual(self.post("/api/run-code", {"code": code}).json, {"status": "started"})
        return self.wait(timeout)

    def wait(self, timeout=20):
        out, err = "", ""
        deadline = time.time() + timeout
        while time.time() < deadline:
            data = self.client.get("/api/get-output", base_url=self.base).json
            out += data["stdout"]
            err += data["stderr"]
            if data["exit_code"] is not None:
                return out, err, data["exit_code"]
            time.sleep(0.02)
        self.fail(f"program did not finish; stdout={out[:200]!r} stderr={err[:200]!r}")

    def test_rejects_other_websites_and_hosts(self):
        evil = self.post("/api/run-code", {"code": "print(1)"}, Origin="https://evil.example")
        self.assertEqual(evil.status_code, 403)
        rebound = self.client.post("/api/run-code", json={"code": "print(1)"},
                                   base_url="http://evil.example:5000")
        self.assertEqual(rebound.status_code, 403)
        ok = self.post("/api/stop", {}, Origin="http://localhost:5173")
        self.assertEqual(ok.status_code, 200)

    def test_output_and_exit_code(self):
        out, err, code = self.run_until_done("import sys\nprint('hi')\nsys.exit(3)")
        self.assertEqual((out.strip(), err, code), ("hi", "", 3))

    def test_unicode_output(self):
        out, _, code = self.run_until_done("print('🎉 → done')")
        self.assertEqual((out.strip(), code), ("🎉 → done", 0))

    def test_long_program(self):
        out, _, code = self.run_until_done("x = 1\n" * 20000 + "print('end')")
        self.assertEqual((out.strip(), code), ("end", 0))

    def test_big_stderr_does_not_hang(self):
        _, err, code = self.run_until_done("import sys\nsys.stderr.write('x' * 2000000)\nprint('end')")
        self.assertEqual((len(err), code), (2000000, 0))

    def test_prompt_appears_before_input_is_sent(self):
        self.post("/api/run-code", {"code": "n = input('Name: ')\nprint('Hello ' + n)"})
        seen, deadline = "", time.time() + 10
        while "Name: " not in seen and time.time() < deadline:
            seen += self.client.get("/api/get-output", base_url=self.base).json["stdout"]
            time.sleep(0.02)
        self.assertIn("Name: ", seen)
        self.assertEqual(self.post("/api/send-input", {"input": "Vox"}).json, {"ok": True})
        out, _, code = self.wait()
        self.assertEqual((out.strip(), code), ("Hello Vox", 0))

    def test_endless_program_keeps_server_responsive_and_can_stop(self):
        self.post("/api/run-code", {"code": "while True:\n    print('x' * 1000)"})
        start = time.time()
        self.client.get("/api/get-output", base_url=self.base)
        self.assertLess(time.time() - start, 1)
        time.sleep(0.5)
        self.assertLessEqual(server.active_run.output.qsize(), server.MAX_QUEUED_CHUNKS)
        process = server.active_run.process
        self.assertEqual(self.post("/api/stop", {}).json, {"stopped": True})
        self.assertIsNotNone(process.poll())

    def test_new_run_replaces_old_run(self):
        self.post("/api/run-code", {"code": "import time\nprint('old')\ntime.sleep(60)"})
        out, _, _ = self.run_until_done("print('new')")
        self.assertEqual(out.strip(), "new")

    def test_ai_route_returns_cleaned_code(self):
        fake = SimpleNamespace(models=SimpleNamespace(generate_content=lambda **kw: SimpleNamespace(
            text="```python\nprint('hi')\n```")))
        with mock.patch.object(server, "client", fake):
            res = self.post("/api/process-command", {"command": "say hi"})
        self.assertEqual(res.json, {"code": "print('hi')"})

    def test_ai_errors_are_reported(self):
        def fail(**kw):
            raise RuntimeError("key rejected")
        fake = SimpleNamespace(models=SimpleNamespace(generate_content=fail))
        with mock.patch.object(server, "client", fake):
            res = self.post("/api/process-command", {"command": "say hi"})
        self.assertEqual(res.json, {"error": "key rejected"})


if __name__ == "__main__":
    unittest.main()
