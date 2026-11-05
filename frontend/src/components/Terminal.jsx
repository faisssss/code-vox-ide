import React, {
  forwardRef,
  useImperativeHandle,
  useState,
  useRef,
  useEffect
} from "react";

const MAX_LINES = 2000; // an endless program must not fill the browser's memory
const MAX_SPOKEN_CHARS = 300;

const Terminal = forwardRef((props, ref) => {
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState("");
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const speechEnabledRef = useRef(true);
  const bottomRef = useRef(null);
  const backendDownRef = useRef(false);

  const addLine = (line) =>
    setLines((prev) => [...prev, line].slice(-MAX_LINES));

  const speak = (text) => {
    if (!speechEnabledRef.current || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text.slice(-MAX_SPOKEN_CHARS));
    u.lang = "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const reportError = (message) => {
    addLine(`ERROR: ${message}`);
    speak(message);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  // Poll for output
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("http://localhost:5000/api/get-output");
        const data = await res.json();

        if (backendDownRef.current) {
          backendDownRef.current = false;
          addLine("Backend connected.");
        }
        if (data.stdout) {
          addLine(data.stdout);
          speak(data.stdout);
        }
        if (data.stderr) {
          reportError(data.stderr);
        }
        if (data.exit_code !== null && data.exit_code !== undefined) {
          const message = `Program finished with exit code ${data.exit_code}.`;
          addLine(message);
          // Do not talk over the output or error that was just read aloud.
          if (!data.stdout && !data.stderr) speak(message);
        }
      } catch {
        if (!backendDownRef.current) {
          backendDownRef.current = true;
          reportError("Cannot reach the backend. Start it with: python app.py");
        }
      }
    }, 300);

    return () => clearInterval(interval);
    // Only one poller is wanted; the helpers it uses read refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    printCommand(cmd) {
      if (!cmd) return;
      addLine(`> ${cmd}`);
    },
    printError: reportError,
    announce(message) {
      addLine(message);
      speak(message);
    },
    clear() {
      setLines([]);
    }
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    // A blank line is valid input: "press Enter to continue".
    const value = input;
    addLine(value);
    setInput("");

    try {
      const res = await fetch("http://localhost:5000/api/send-input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: value })
      });
      const data = await res.json();
      if (data.error) reportError(data.error);
    } catch (err) {
      reportError(err.message || String(err));
    }
  };

  return (
    <div className="bg-[#111] text-gray-300 text-sm font-mono border-t border-[#2a2a2a] flex flex-col">
      <div className="p-2 flex justify-between text-gray-400 border-b border-[#2a2a2a]">
        <div>Terminal</div>
        <label className="cursor-pointer text-xs">
          <input
            type="checkbox"
            checked={speechEnabled}
            onChange={(e) => {
              speechEnabledRef.current = e.target.checked;
              setSpeechEnabled(e.target.checked);
              if (!e.target.checked) window.speechSynthesis?.cancel();
            }}
          />
          &nbsp;Read results aloud
        </label>
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-label="Terminal output"
        tabIndex={0}
        className="h-44 overflow-auto px-4 py-2"
      >
        {lines.map((l, i) => (
          <div key={i} className="whitespace-pre-wrap">{l}</div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[#2a2a2a] px-4 py-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Program input"
          className="w-full bg-[#1a1a1a] text-gray-200 px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Type input and press Enter"
        />
      </form>
    </div>
  );
});

export default Terminal;
