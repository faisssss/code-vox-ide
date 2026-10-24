// src/components/RightPanel.jsx
import React, { useEffect, useState } from "react";

export default function RightPanel({ model, outline = [], editorRef }) {
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!model) {
      setContent("");
      return;
    }

    setContent(model.getValue());

    const disposable = model.onDidChangeContent(() => {
      setContent(model.getValue());
    });

    return () => {
      disposable.dispose();
    };
  }, [model]);

  const goToLine = (line) => {
    if (!editorRef?.current) return;
    const editor = editorRef.current;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
  };

  return (
    <aside className="w-56 bg-[#1e1e1e] border-l border-gray-700 flex flex-col">

      {outline.length > 0 && (
        <div className="p-3 border-b border-gray-700">
          <div className="text-gray-300 font-semibold text-sm mb-2">
            Outline
          </div>

          <ul className="space-y-1 text-xs">
            {outline.map((item, i) => (
              <li key={i}>
                <button
                  onClick={() => goToLine(item.line)}
                  className="w-full text-left px-2 py-1 rounded hover:bg-[#2a2a2a] text-gray-300"
                >
                  <span className="text-gray-500 mr-1">
                    {item.type}
                  </span>
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 p-3 overflow-auto">
        <div className="bg-[#111] border border-gray-700 rounded-lg p-3 shadow-inner">
          <pre className="text-[9px] leading-tight text-gray-400 whitespace-pre-wrap font-mono">
            {content}
          </pre>
        </div>
      </div>
    </aside>
  );
}