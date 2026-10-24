import os
import json
import sys
import subprocess
import threading
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

app = Flask(__name__)
CORS(app)

# =========================
# AI CONFIGURATION
# =========================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel("models/gemini-2.5-flash")
else:
    model = None

# =========================
# PROCESS MANAGEMENT
# =========================

active_process = None
process_lock = threading.Lock()

# =========================
# AI COMMAND ROUTE
# =========================

@app.route("/api/process-command", methods=["POST"])
def process_command():
    try:
        if not model:
            return jsonify({"error": "AI not configured"}), 200

        data = request.json
        spoken = data.get("command", "")

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
No triple quotes.
No explanations.

User said:
{spoken}
"""

        response = model.generate_content(prompt)
        text = response.text.strip()

        if text.startswith("```"):
            text = text.replace("```python", "")
            text = text.replace("```", "")
            text = text.strip()

        if text.lower().startswith("python"):
            text = text[6:].strip()

        text = text.replace("'''", "")
        text = text.replace('"""', "")

        return jsonify({"code": text}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 200


# =========================
# RUN CODE
# =========================

@app.route("/api/run-code", methods=["POST"])
def run_code():
    global active_process

    try:
        data = request.json
        code = data.get("code", "")

        with process_lock:
            if active_process:
                active_process.kill()
                active_process = None

            active_process = subprocess.Popen(
                [sys.executable, "-u", "-c", code],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=0
            )

        return jsonify({"status": "started"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 200


# =========================
# SEND INPUT
# =========================

@app.route("/api/send-input", methods=["POST"])
def send_input():
    global active_process

    try:
        data = request.json
        user_input = data.get("input", "")

        if active_process and active_process.stdin:
            active_process.stdin.write(user_input + "\n")
            active_process.stdin.flush()

        return jsonify({"ok": True}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 200


# =========================
# GET OUTPUT (NON-BLOCKING SAFE)
# =========================

@app.route("/api/get-output", methods=["GET"])
def get_output():
    global active_process

    try:
        if not active_process:
            return jsonify({"stdout": "", "stderr": ""}), 200

        stdout = ""
        stderr = ""

        # Non-blocking safe read
        try:
            if active_process.stdout:
                stdout = active_process.stdout.read() or ""
        except:
            pass

        try:
            if active_process.stderr:
                stderr = active_process.stderr.read() or ""
        except:
            pass

        if active_process.poll() is not None:
            active_process = None

        return jsonify({
            "stdout": stdout,
            "stderr": stderr
        }), 200

    except Exception as e:
        return jsonify({"stdout": "", "stderr": str(e)}), 200


# =========================
# START SERVER
# =========================

if __name__ == "__main__":
    app.run(debug=True, port=5000)