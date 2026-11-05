import atexit
import codecs
import os
import queue
import re
import subprocess
import sys
import tempfile
import threading

from dotenv import load_dotenv
from flask import Flask, abort, jsonify, request
from flask_cors import CORS
from google import genai

load_dotenv()

app = Flask(__name__)

# This server runs any code it receives, so only the local frontend may call it.
ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}
ALLOWED_HOSTS = {"localhost:5000", "127.0.0.1:5000"}
CORS(app, origins=list(ALLOWED_ORIGINS))


@app.before_request
def only_local_frontend():
    # The Host check stops DNS rebinding; the Origin check stops other websites.
    if request.host not in ALLOWED_HOSTS:
        abort(403)
    origin = request.headers.get("Origin")
    if origin and origin not in ALLOWED_ORIGINS:
        abort(403)


# =========================
# AI
# =========================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
# The "latest" alias keeps working when Google retires a model version.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

FENCE = re.compile(r"^\s*```[^\n]*\n(.*?)\n?```\s*$", re.DOTALL)
LABEL = re.compile(r"^python[ \t]*\n", re.IGNORECASE)


def clean_code(text):
    """Remove a markdown fence or language label around the code, and nothing else."""
    match = FENCE.match(text)
    if match:
        text = match.group(1)
    return LABEL.sub("", text.strip(), count=1).strip()


@app.route("/api/process-command", methods=["POST"])
def process_command():
    try:
        if not client:
            return jsonify({"error": "AI not configured: set GEMINI_API_KEY in backend/.env"}), 200

        spoken = request.json.get("command", "")
        if not spoken:
            return jsonify({"error": "No command provided"}), 200

        prompt = f"""
Convert this request into complete executable Python code.
Return ONLY pure Python code.
DO NOT use input().
DO NOT ask for user input.
If values are required, use hardcoded example values.
Code must run immediately without waiting.
No markdown.
No backticks.
No language labels.
No explanations.

User said:
{spoken}
"""
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config={"http_options": {"timeout": 60000}},
        )
        code = clean_code(response.text or "")
        if not code:
            return jsonify({"error": "The AI returned no code. Please try again."}), 200
        return jsonify({"code": code}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 200


# =========================
# PROGRAM RUNNER
# =========================

CHUNK_BYTES = 4096
MAX_QUEUED_CHUNKS = 256  # when full, the program waits, so memory stays bounded


class ProgramRun:
    """One running user program, with its output collected by background threads."""

    def __init__(self, code):
        # A temp file avoids the Windows command-line length limit. The temp folder
        # as working directory stops user code from overwriting this backend.
        # shortcut: the browser never reveals the opened folder's real path, so
        # programs cannot read sibling files; upgrade by uploading them here.
        self.folder = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        path = os.path.join(self.folder.name, "main.py")
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(code)

        self.process = subprocess.Popen(
            [sys.executable, "-u", path],
            cwd=self.folder.name,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={**os.environ, "PYTHONUTF8": "1"},
        )
        self.output = queue.Queue(MAX_QUEUED_CHUNKS)
        self.stopped = threading.Event()
        self.readers = [
            threading.Thread(target=self._read, args=(self.process.stdout, "stdout"), daemon=True),
            threading.Thread(target=self._read, args=(self.process.stderr, "stderr"), daemon=True),
        ]
        for reader in self.readers:
            reader.start()

    def _read(self, stream, name):
        decoder = codecs.getincrementaldecoder("utf-8")("replace")
        while not self.stopped.is_set():
            try:
                # os.read returns as soon as anything is available, so prompts
                # without a newline, like input("Name: "), appear right away.
                data = os.read(stream.fileno(), CHUNK_BYTES)
            except OSError:
                return
            text = decoder.decode(data, final=not data)
            while text and not self.stopped.is_set():
                try:
                    self.output.put((name, text), timeout=0.2)
                    break
                except queue.Full:
                    pass
            if not data:
                return

    def collect(self):
        """Return queued output, plus the exit code once everything has been read."""
        finished = self.process.poll() is not None and not any(r.is_alive() for r in self.readers)
        chunks = {"stdout": [], "stderr": []}
        while True:
            try:
                name, text = self.output.get_nowait()
            except queue.Empty:
                break
            chunks[name].append(text)
        return {
            "stdout": "".join(chunks["stdout"]),
            "stderr": "".join(chunks["stderr"]),
            "exit_code": self.process.returncode if finished else None,
        }

    def send(self, text):
        self.process.stdin.write(text.encode("utf-8") + b"\n")
        self.process.stdin.flush()

    def close(self):
        self.stopped.set()
        if self.process.poll() is None:
            self.process.kill()
        self.process.wait()
        for reader in self.readers:
            reader.join(1)
        for stream, reader in zip((self.process.stdout, self.process.stderr), self.readers):
            if not reader.is_alive():  # a program's child can keep a pipe open
                stream.close()
        try:
            self.process.stdin.close()
        except OSError:
            pass  # unsent input to a finished program does not matter
        self.folder.cleanup()


active_run = None
run_lock = threading.Lock()


def stop_active_run():
    global active_run
    if active_run:
        active_run.close()
        active_run = None


atexit.register(stop_active_run)


@app.route("/api/run-code", methods=["POST"])
def run_code():
    global active_run
    try:
        code = request.json.get("code", "")
        with run_lock:
            stop_active_run()
            active_run = ProgramRun(code)
        return jsonify({"status": "started"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 200


@app.route("/api/stop", methods=["POST"])
def stop():
    with run_lock:
        was_running = active_run is not None
        stop_active_run()
    return jsonify({"stopped": was_running}), 200


@app.route("/api/send-input", methods=["POST"])
def send_input():
    try:
        user_input = request.json.get("input", "")
        with run_lock:
            if not active_run:
                return jsonify({"error": "No program is running"}), 200
            active_run.send(user_input)
        return jsonify({"ok": True}), 200
    except OSError:
        return jsonify({"error": "The program is no longer accepting input"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 200


@app.route("/api/get-output", methods=["GET"])
def get_output():
    with run_lock:
        if not active_run:
            return jsonify({"stdout": "", "stderr": "", "exit_code": None}), 200
        result = active_run.collect()
        if result["exit_code"] is not None:
            stop_active_run()
    return jsonify(result), 200


# =========================
# START SERVER
# =========================

if __name__ == "__main__":
    app.run(port=5000)
