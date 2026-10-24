import React, {
  forwardRef,
  useImperativeHandle,
  useState,
  useRef,
  useEffect
} from "react";

const Terminal = forwardRef((props, ref) => {
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  // Poll for output
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("http://localhost:5000/api/get-output");
        const data = await res.json();

        if (data.stdout) {
          setLines(prev => [...prev, data.stdout]);
        }

        if (data.stderr) {
          setLines(prev => [...prev, `ERROR: ${data.stderr}`]);

          if (ttsEnabled) {
            const u = new SpeechSynthesisUtterance(data.stderr);
            u.lang = "en-US";
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
          }
        }
      } catch {}
    }, 300);

    return () => clearInterval(interval);
  }, [ttsEnabled]);

  useImperativeHandle(ref, () => ({
    printCommand(cmd) {
      if (!cmd) return;
      setLines(prev => [...prev, `> ${cmd}`]);
    },
    clear() {
      setLines([]);
    }
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const value = input;
    setLines(prev => [...prev, value]);
    setInput("");

    await fetch("http://localhost:5000/api/send-input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: value })
    });
  };

  return (
    <div className="bg-[#111] text-gray-300 text-sm font-mono border-t border-[#2a2a2a] flex flex-col">
      <div className="p-2 flex justify-between text-gray-400 border-b border-[#2a2a2a]">
        <div>Terminal</div>
        <label className="cursor-pointer text-xs">
          <input
            type="checkbox"
            checked={ttsEnabled}
            onChange={() => setTtsEnabled(!ttsEnabled)}
          />
          &nbsp;Read errors aloud
        </label>
      </div>

      <div className="h-44 overflow-auto px-4 py-2">
        {lines.map((l, i) => (
          <div key={i} className="whitespace-pre-wrap">{l}</div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[#2a2a2a] px-4 py-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full bg-[#1a1a1a] text-gray-200 px-2 py-1 outline-none"
          placeholder="Type input and press Enter"
        />
      </form>
    </div>
  );
});

export default Terminal;