import React, { useRef, useState, useCallback } from "react";
import * as monaco from "monaco-editor";
import Sidebar from "./components/Sidebar";
import TabBar from "./components/TabBar";
import Editor from "./components/Editor";
import Terminal from "./components/Terminal";
import StatusBar from "./components/StatusBar";
import Welcome from "./components/Welcome";
import VoiceController from "./components/VoiceController";
import RightPanel from "./components/RightPanel";

export default function App() {
  const [tabs, setTabs] = useState([
    { id: "welcome", title: "Welcome", type: "welcome" },
  ]);
  const [activeTab, setActiveTab] = useState("welcome");
  const [models, setModels] = useState({});
  const [outline, setOutline] = useState([]);

  const editorRef = useRef(null);
  const terminalRef = useRef(null);

  /* ================= OPEN FOLDER ================= */

  const handleOpenFolder = async () => {
    try {
      const root = await window.showDirectoryPicker();
      if (!root) return;

      window.dispatchEvent(
        new CustomEvent("codevox-open-folder", {
          detail: root,
        })
      );
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error(err);
      }
    }
  };

  /* ================= CLOSE TAB ================= */

  const closeTab = (id) => {
    if (id === "welcome") return;

    if (models[id]) models[id].dispose();

    setModels((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      const next = remaining.length
        ? remaining[remaining.length - 1].id
        : "welcome";
      setActiveTab(next);
      return remaining.length
        ? remaining
        : [{ id: "welcome", title: "Welcome", type: "welcome" }];
    });
  };

  /* ================= OPEN FILE ================= */

  const openFile = async (path, fileHandle) => {
    if (models[path]) {
      setActiveTab(path);
      return;
    }

    const file = await fileHandle.getFile();
    const content = await file.text();

    const model = monaco.editor.createModel(content, "python");

    model.onDidChangeContent(() => {
      handleEditorContentChange(model.getValue());
      saveFile(fileHandle, model.getValue());
    });

    setModels((prev) => ({ ...prev, [path]: model }));

    setTabs((prev) => [
      ...prev,
      { id: path, title: path.split("/").pop(), type: "editor" },
    ]);

    setActiveTab(path);
  };

  const saveFile = async (fileHandle, content) => {
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    } catch {}
  };

  /* ================= OUTLINE ================= */

  const handleEditorContentChange = useCallback((text) => {
    const lines = text.split("\n");
    const items = [];

    lines.forEach((line, i) => {
      const ln = line.trim();
      if (ln.startsWith("def ")) {
        items.push({
          type: "function",
          name: ln.split("(")[0].replace("def ", ""),
          line: i + 1,
        });
      }
      if (ln.startsWith("class ")) {
        items.push({
          type: "class",
          name: ln.split("(")[0].replace("class ", ""),
          line: i + 1,
        });
      }
    });

    setOutline(items);
  }, []);

  /* ================= RUN CODE (FIXED) ================= */

  const runCode = async () => {
  if (!editorRef.current) return;

  const rawCode = editorRef.current.getValue();

  terminalRef.current?.clear();
  terminalRef.current?.printCommand("Running...");

  await fetch("http://localhost:5000/api/run-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: rawCode }),
  });
};

  /* ================= CURRENT TAB ================= */

  const currentTab = tabs.find((t) => t.id === activeTab);
  const currentModel =
    activeTab !== "welcome" ? models[activeTab] : null;

  /* ================= UI ================= */

  return (
    <div className="h-screen flex bg-[#181818] text-gray-200">
      <Sidebar onOpenFile={openFile} onRun={runCode} />

      <div className="flex-1 flex flex-col">
        <TabBar
          tabs={tabs}
          activeTab={activeTab}
          onSetActive={setActiveTab}
          onClose={closeTab}
        />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col border-r border-gray-700">
            <div className="flex-1 bg-[#1e1e1e] relative">
              {currentTab?.type === "welcome" ? (
                <Welcome onOpenFolder={handleOpenFolder} />
              ) : (
                <Editor
                  key={activeTab}
                  ref={editorRef}
                  model={currentModel}
                />
              )}

              <VoiceController
                editorRef={editorRef}
                terminalRef={terminalRef}
                onRunRequested={runCode}
              />
            </div>

            <Terminal ref={terminalRef} />
          </div>

          <RightPanel
            outline={outline}
            editorRef={editorRef}
            model={currentModel}
          />
        </div>

        <StatusBar onRun={runCode} />
      </div>
    </div>
  );
}