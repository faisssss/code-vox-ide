// src/components/VoiceController.jsx
import React, { useEffect, useRef, useState } from "react";
import { FiMic } from "react-icons/fi";
import * as monaco from "monaco-editor";

export default function VoiceController({
  editorRef,
  terminalRef,
  onRunRequested,
}) {
  const [listening, setListening] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [mode, setMode] = useState("program");

  const recognitionRef = useRef(null);
  const shouldListenRef = useRef(false);

  /* ---------------- FIXED SPOKEN MAP ---------------- */

  function spokenToCode(text) {
    let result = text.toLowerCase();

    // Handle plural first
    result = result.replace(/\bdouble quotes\b/g, '""');
    result = result.replace(/\bsingle quotes\b/g, "''");

    // Then singular
    result = result.replace(/\bdouble quote\b/g, '"');
    result = result.replace(/\bsingle quote\b/g, "'");

    const map = {
      tab: "\t",
      "new line": "\n",
      "next line": "\n",
      enter: "\n",
      colon: ":",
      semicolon: ";",
      comma: ",",
      period: ".",
      dot: ".",
      "open bracket": "(",
      "close bracket": ")",
      "open square bracket": "[",
      "close square bracket": "]",
      "open curly": "{",
      "close curly": "}",
      equals: "=",
      plus: "+",
      minus: "-",
      multiply: "*",
      times: "*",
      divide: "/",
    };

    Object.entries(map).forEach(([k, v]) => {
      const regex = new RegExp(`\\b${k}\\b`, "g");
      result = result.replace(regex, v);
    });

    return result;
  }

  /* ---------------- DICTATION ---------------- */

  function applyDictationCommand(transcript) {
    const editor = editorRef?.current;
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    const text = transcript.toLowerCase();
    const position = editor.getPosition();
    if (!position) return;

    if (text === "cursor left") {
      editor.setPosition({
        lineNumber: position.lineNumber,
        column: Math.max(1, position.column - 1),
      });
      editor.focus();
      return;
    }

    if (text === "cursor right") {
      editor.setPosition({
        lineNumber: position.lineNumber,
        column: position.column + 1,
      });
      editor.focus();
      return;
    }

    if (text === "cursor up") {
      editor.setPosition({
        lineNumber: Math.max(1, position.lineNumber - 1),
        column: position.column,
      });
      editor.focus();
      return;
    }

    if (text === "cursor down") {
      editor.setPosition({
        lineNumber: Math.min(
          model.getLineCount(),
          position.lineNumber + 1
        ),
        column: position.column,
      });
      editor.focus();
      return;
    }

    if (
      text === "backspace" ||
      text === "delete" ||
      text === "delete character"
    ) {
      editor.trigger("keyboard", "deleteLeft", null);
      editor.focus();
      return;
    }

    if (text === "enter" || text === "new line" || text === "next line") {
      editor.trigger("keyboard", "type", { text: "\n" });
      editor.focus();
      return;
    }

    if (text.startsWith("go to line")) {
      const n = parseInt(text.replace(/\D/g, ""));
      if (!n) return;
      const line = Math.max(1, Math.min(n, model.getLineCount()));
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
      return;
    }

    if (text.startsWith("delete line")) {
      const n = parseInt(text.replace(/\D/g, ""));
      if (!n) return;

      editor.executeEdits("", [
        {
          range: new monaco.Range(n, 1, n + 1, 1),
          text: "",
        },
      ]);
      editor.focus();
      return;
    }

    if (text.startsWith("replace line")) {
      const n = parseInt(text.replace(/\D/g, ""));
      const parts = transcript.split(/with/i);
      const content = spokenToCode((parts[1] || "").trim());
      if (!n) return;

      editor.executeEdits("", [
        {
          range: new monaco.Range(
            n,
            1,
            n,
            model.getLineMaxColumn(n)
          ),
          text: content,
        },
      ]);
      editor.focus();
      return;
    }

    const mapped = spokenToCode(transcript);
    editor.trigger("keyboard", "type", { text: mapped });
    editor.focus();
  }

  /* ---------------- RECOGNITION ---------------- */

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recog = new SR();
    recog.lang = "en-US";
    recog.interimResults = false;
    recog.continuous = false;

    recog.onstart = () => setListening(true);

    recog.onend = () => {
      setListening(false);
      if (shouldListenRef.current) {
        try {
          recog.start();
        } catch {}
      }
    };

    recog.onerror = () => setListening(false);

    recog.onresult = async (event) => {
      const transcript = event.results[0][0].transcript.trim();
      terminalRef?.current?.printCommand(`🎤 ${transcript}`);

      const lower = transcript.toLowerCase();

      if (lower.includes("run")) {
        onRunRequested?.();
        return;
      }

      if (mode === "dictation") {
        applyDictationCommand(transcript);
        return;
      }

      // PROGRAM MODE (original behavior restored)
      try {
        const res = await fetch(
          "http://localhost:5000/api/process-command",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              command: transcript,
              mode: "program",
            }),
          }
        );

        const data = await res.json();

        if (data.error) {
          terminalRef?.current?.printError(data.error);
          return;
        }

        const code = data.code || "";

        if (editorRef?.current && code) {
          editorRef.current.setValue(code);
          editorRef.current.focus();
        }
      } catch (err) {
        terminalRef?.current?.printError(
          err.message || String(err)
        );
      }
    };

    recognitionRef.current = recog;
  }, [mode]);

  const toggle = () => {
    const recog = recognitionRef.current;
    if (!recog) return;

    try {
      if (listening) {
        shouldListenRef.current = false;
        recog.stop();
      } else {
        shouldListenRef.current = true;
        recog.start();
      }
    } catch {}
  };

  return (
    <>
      <button
        onClick={toggle}
        className={`fixed z-50 bottom-24 right-6 p-3 rounded-full shadow-lg ${
          listening ? "bg-red-600" : "bg-blue-600"
        } text-white`}
      >
        <FiMic size={18} />
      </button>

      <div className="fixed bottom-28 right-20 bg-[#111] px-3 py-2 rounded-lg text-xs border border-gray-600 space-y-1">
        <div className="text-gray-300 font-semibold">
          🎤 Voice Controls
        </div>

        <label>
          <input
            type="checkbox"
            checked={handsFree}
            onChange={(e) => {
              setHandsFree(e.target.checked);
              shouldListenRef.current = e.target.checked;
            }}
          />
          &nbsp;Hands-free mode
        </label>

        <div>
          <label>
            <input
              type="radio"
              checked={mode === "program"}
              onChange={() => setMode("program")}
            />
            &nbsp;Full program mode
          </label>
          <br />
          <label>
            <input
              type="radio"
              checked={mode === "dictation"}
              onChange={() => setMode("dictation")}
            />
            &nbsp;Line-by-line mode
          </label>
        </div>
      </div>
    </>
  );
}