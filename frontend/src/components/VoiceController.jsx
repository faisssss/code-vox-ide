// src/components/VoiceController.jsx
import React, { useEffect, useRef, useState } from "react";
import { FiMic } from "react-icons/fi";
import * as monaco from "monaco-editor";
import {
  isRunCommand,
  isStopCommand,
  isUndoCommand,
  parseLineCommand,
  parseOpenFile,
  spokenToCode,
} from "../voiceCommands";

const FATAL_MIC_ERRORS = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser settings.",
  "service-not-allowed": "Speech recognition is blocked in this browser.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs an internet connection.",
};

export default function VoiceController(props) {
  const [listening, setListening] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [mode, setMode] = useState("program");

  const recognitionRef = useRef(null);
  const listeningRef = useRef(false);
  const handsFreeRef = useRef(false);
  const modeRef = useRef("program");

  // The recognizer lives as long as the page, so it reads the newest props from here.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const terminal = () => latest.current.terminalRef?.current;

  /* ---------------- FULL PROGRAM ---------------- */

  function insertGeneratedCode(code) {
    // Added to the end with undo kept: a misheard request must never destroy a file.
    const model = latest.current.currentModel || latest.current.onUntitledRequested();
    const end = model.getFullModelRange().getEndPosition();
    const startLine = end.lineNumber + (model.getValue().trim() ? 2 : 0);
    const text = model.getValue().trim() ? `\n\n${code}\n` : `${code}\n`;

    model.pushStackElement();
    model.pushEditOperations(
      [],
      [{ range: monaco.Range.fromPositions(end), text }],
      () => null
    );
    model.pushStackElement();

    const editor = latest.current.editorRef?.current;
    if (editor?.getModel() === model) {
      editor.revealLineInCenter(startLine);
      editor.setPosition({ lineNumber: startLine, column: 1 });
      editor.focus();
    }
    terminal()?.announce(`Code added at line ${startLine}. Say undo to remove it.`);
  }

  /* ---------------- DICTATION ---------------- */

  function applyLineCommand(editor, model, command) {
    const { action, line, content } = command;
    const count = model.getLineCount();

    if (!line || line > count) {
      terminal()?.printError(
        line
          ? `Line ${line} does not exist. This file has ${count} lines.`
          : "Please say a line number, like: go to line 5."
      );
      return;
    }

    if (action === "go to") {
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
    } else if (action === "delete") {
      // The last line has no line break after it, so remove the one before it.
      const range = line < count
        ? new monaco.Range(line, 1, line + 1, 1)
        : new monaco.Range(
            Math.max(1, line - 1),
            line > 1 ? model.getLineMaxColumn(line - 1) : 1,
            line,
            model.getLineMaxColumn(line)
          );
      editor.executeEdits("voice", [{ range, text: "" }]);
    } else {
      editor.executeEdits("voice", [
        {
          range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
          text: spokenToCode(content),
        },
      ]);
    }
    editor.focus();
  }

  function applyDictationCommand(transcript) {
    const editor = latest.current.editorRef?.current;
    const model = editor?.getModel();
    const position = editor?.getPosition();

    if (!position) {
      latest.current.onUntitledRequested();
      terminal()?.announce("New file opened. Please say that again.");
      return;
    }

    const text = transcript.toLowerCase();
    const moves = {
      "cursor left": { column: Math.max(1, position.column - 1) },
      "cursor right": { column: position.column + 1 },
      "cursor up": { lineNumber: Math.max(1, position.lineNumber - 1) },
      "cursor down": {
        lineNumber: Math.min(model.getLineCount(), position.lineNumber + 1),
      },
    };

    if (moves[text]) {
      editor.setPosition({ ...position, ...moves[text] });
    } else if (["backspace", "delete", "delete character"].includes(text)) {
      editor.trigger("voice", "deleteLeft", null);
    } else if (["enter", "new line", "next line"].includes(text)) {
      editor.trigger("voice", "type", { text: "\n" });
    } else {
      const command = parseLineCommand(transcript);
      if (command) {
        applyLineCommand(editor, model, command);
        return;
      }
      editor.trigger("voice", "type", { text: spokenToCode(transcript) });
    }
    editor.focus();
  }

  /* ---------------- HANDLE SPEECH ---------------- */

  async function handleTranscript(transcript) {
    terminal()?.printCommand(`🎤 ${transcript}`);

    if (isRunCommand(transcript)) {
      latest.current.onRunRequested();
      return;
    }
    if (isStopCommand(transcript)) {
      latest.current.onStopRequested();
      return;
    }
    if (isUndoCommand(transcript)) {
      const model = latest.current.currentModel;
      if (model) {
        model.undo();
        terminal()?.announce("Undone.");
      } else {
        terminal()?.printError("Nothing to undo. Open a file first.");
      }
      return;
    }

    const fileName = parseOpenFile(transcript);
    if (fileName) {
      const opened = await latest.current.onOpenFileRequested(fileName);
      if (opened) {
        terminal()?.announce(`Opened ${fileName}.`);
      } else {
        terminal()?.printError(
          `Could not find ${fileName}. Use the Open Folder button if no folder is open.`
        );
      }
      return;
    }

    if (modeRef.current === "dictation") {
      applyDictationCommand(transcript);
      return;
    }

    try {
      terminal()?.announce("Writing code.");
      const res = await fetch("http://localhost:5000/api/process-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: transcript }),
      });
      const data = await res.json();

      if (data.error) {
        terminal()?.printError(data.error);
      } else if (data.code) {
        insertGeneratedCode(data.code);
      } else {
        terminal()?.printError("The AI returned no code. Please try again.");
      }
    } catch (err) {
      terminal()?.printError(err.message || String(err));
    }
  }

  const handleTranscriptRef = useRef(handleTranscript);
  useEffect(() => {
    handleTranscriptRef.current = handleTranscript;
  });

  /* ---------------- RECOGNITION ---------------- */

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recog = new SR();
    recog.lang = "en-US";
    recog.interimResults = false;
    recog.continuous = false;

    recog.onstart = () => {
      listeningRef.current = true;
      setListening(true);
    };

    recog.onend = () => {
      listeningRef.current = false;
      setListening(false);
      if (handsFreeRef.current) {
        try {
          recog.start();
        } catch {
          // Already starting: the browser restarts it by itself.
        }
      }
    };

    recog.onerror = (event) => {
      const message = FATAL_MIC_ERRORS[event.error];
      if (message) {
        handsFreeRef.current = false;
        setHandsFree(false);
        terminal()?.printError(message);
      }
    };

    recog.onresult = (event) => {
      // Our own spoken feedback must not be heard as a command.
      if (window.speechSynthesis?.speaking) return;
      handleTranscriptRef.current(event.results[0][0].transcript.trim());
    };

    recognitionRef.current = recog;
    return () => {
      recog.onend = null;
      recog.abort();
    };
  }, []);

  const startListening = () => {
    if (!recognitionRef.current) {
      terminal()?.printError("Voice control needs Chrome or Edge.");
      return false;
    }
    try {
      recognitionRef.current.start();
    } catch {
      // Already listening.
    }
    return true;
  };

  const setHandsFreeMode = (on) => {
    handsFreeRef.current = on;
    setHandsFree(on);
    if (on) {
      if (!startListening()) {
        handsFreeRef.current = false;
        setHandsFree(false);
      }
    } else if (listeningRef.current) {
      recognitionRef.current?.stop();
    }
  };

  const toggle = () => {
    if (listeningRef.current) {
      setHandsFreeMode(false);
      recognitionRef.current?.stop();
    } else {
      startListening();
    }
  };

  const toggleRef = useRef(toggle);
  useEffect(() => {
    toggleRef.current = toggle;
  });

  useEffect(() => {
    const onToggle = () => toggleRef.current();
    const onKey = (e) => {
      if (e.altKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        toggleRef.current();
      }
    };
    window.addEventListener("codevox-toggle-mic", onToggle);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("codevox-toggle-mic", onToggle);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  return (
    <>
      <button
        onClick={toggle}
        aria-label={listening ? "Stop listening" : "Start listening"}
        aria-pressed={listening}
        title="Microphone (Alt+V)"
        className={`fixed z-50 bottom-24 right-6 p-3 rounded-full shadow-lg ${
          listening ? "bg-red-600" : "bg-blue-600"
        } text-white`}
      >
        <FiMic aria-hidden="true" size={18} />
      </button>

      <div
        role="group"
        aria-label="Voice controls"
        className="fixed z-40 bottom-28 right-20 bg-[#111] px-3 py-2 rounded-lg text-xs border border-gray-600 space-y-1"
      >
        <div className="text-gray-300 font-semibold">
          🎤 Voice Controls
        </div>

        <label>
          <input
            type="checkbox"
            checked={handsFree}
            onChange={(e) => setHandsFreeMode(e.target.checked)}
          />
          &nbsp;Hands-free mode
        </label>

        <div>
          <label>
            <input
              type="radio"
              name="voice-mode"
              checked={mode === "program"}
              onChange={() => {
                modeRef.current = "program";
                setMode("program");
              }}
            />
            &nbsp;Full program mode
          </label>
          <br />
          <label>
            <input
              type="radio"
              name="voice-mode"
              checked={mode === "dictation"}
              onChange={() => {
                modeRef.current = "dictation";
                setMode("dictation");
              }}
            />
            &nbsp;Line-by-line mode
          </label>
        </div>
      </div>
    </>
  );
}
