import React, { useEffect, useRef, useState } from "react";
import * as monaco from "monaco-editor";
import Sidebar from "./components/Sidebar";
import TabBar from "./components/TabBar";
import Editor from "./components/Editor";
import Terminal from "./components/Terminal";
import StatusBar from "./components/StatusBar";
import Welcome from "./components/Welcome";
import VoiceController from "./components/VoiceController";
import RightPanel from "./components/RightPanel";
import { createSaver } from "./fileSaver";

const WELCOME_TAB = { id: "welcome", title: "Welcome", type: "welcome" };

function createModel(id, content) {
  // A fixed address per tab lets the editor attach to this exact model.
  return monaco.editor.createModel(
    content,
    "python",
    monaco.Uri.from({ scheme: "codevox", path: `/${id}` })
  );
}

function findFile(nodes, name) {
  const wanted = name.toLowerCase();
  for (const node of nodes) {
    if (node.type === "file" && [node.name, node.path].some((n) => n.toLowerCase() === wanted)) {
      return node;
    }
    const inside = node.children && findFile(node.children, name);
    if (inside) return inside;
  }
  return null;
}

export default function App() {
  const [tabs, setTabs] = useState([WELCOME_TAB]);
  const [activeTab, setActiveTab] = useState("welcome");
  const [models, setModels] = useState({});

  const editorRef = useRef(null);
  const terminalRef = useRef(null);
  const saversRef = useRef({});
  const openingRef = useRef(new Set());
  const treeRef = useRef([]);
  const untitledCountRef = useRef(0);

  // Warn before the page closes if the last edits have not reached the disk yet.
  useEffect(() => {
    const warn = (e) => {
      if (Object.values(saversRef.current).some((s) => s.hasUnsavedChanges())) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /* ================= OPEN FOLDER ================= */

  const handleOpenFolder = async () => {
    try {
      const root = await window.showDirectoryPicker({ mode: "readwrite" });
      if (!root) return;

      window.dispatchEvent(
        new CustomEvent("codevox-open-folder", {
          detail: root,
        })
      );
    } catch (err) {
      if (err.name !== "AbortError") {
        terminalRef.current?.printError(err.message || String(err));
      }
    }
  };

  // Tabs are named by relative path, so tabs from the old folder must not survive:
  // the same path in the new folder would otherwise open and save the old file.
  const closeAllTabs = async () => {
    await Promise.all(Object.values(saversRef.current).map((s) => s.flush()));
    saversRef.current = {};
    Object.values(models).forEach((model) => model.dispose());
    setModels({});
    setTabs([WELCOME_TAB]);
    setActiveTab("welcome");
  };

  /* ================= CLOSE TAB ================= */

  const closeTab = async (id) => {
    if (id === "welcome") return;

    // Decide the next tab now, so the editor moves off this model before it is disposed.
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    if (activeTab === id) setActiveTab(remaining[remaining.length - 1].id);
    setModels((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    await saversRef.current[id]?.flush();
    delete saversRef.current[id];
    setTimeout(() => models[id]?.dispose(), 0);
  };

  /* ================= OPEN FILE ================= */

  const openFile = async (path, fileHandle) => {
    if (models[path]) {
      setActiveTab(path);
      return;
    }
    // A double click starts two opens before the first one has finished.
    if (openingRef.current.has(path)) return;
    openingRef.current.add(path);

    try {
      const file = await fileHandle.getFile();
      const content = await file.text();
      const model = createModel(path, content);
      const saver = createSaver(fileHandle, (err) =>
        terminalRef.current?.printError(`Could not save ${path}: ${err.message || err}`)
      );
      saversRef.current[path] = saver;

      model.onDidChangeContent(() => saver.save(model.getValue()));

      setModels((prev) => ({ ...prev, [path]: model }));
      setTabs((prev) => [
        ...prev,
        { id: path, title: path.split("/").pop(), type: "editor" },
      ]);
      setActiveTab(path);
    } catch (err) {
      terminalRef.current?.printError(`Could not open ${path}: ${err.message || err}`);
    } finally {
      openingRef.current.delete(path);
    }
  };

  const openFileByName = async (name) => {
    const node = findFile(treeRef.current, name);
    if (!node) return false;
    await openFile(node.path, node.handle);
    return true;
  };

  /* ================= UNTITLED ================= */

  // Lets voice work before any folder is open. Untitled text is never written to disk.
  const openUntitled = () => {
    untitledCountRef.current += 1;
    const id = `untitled-${untitledCountRef.current}`;
    const model = createModel(id, "");
    setModels((prev) => ({ ...prev, [id]: model }));
    setTabs((prev) => [
      ...prev,
      { id, title: `Untitled ${untitledCountRef.current}`, type: "editor" },
    ]);
    setActiveTab(id);
    return model;
  };

  /* ================= RUN CODE ================= */

  const currentTab = tabs.find((t) => t.id === activeTab);
  const currentModel =
    activeTab !== "welcome" ? models[activeTab] || null : null;

  const runCode = async () => {
    if (!currentModel) {
      terminalRef.current?.printError("Nothing to run. Open a file first.");
      return;
    }

    terminalRef.current?.clear();
    terminalRef.current?.printCommand("Running...");

    try {
      const res = await fetch("http://localhost:5000/api/run-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: currentModel.getValue() }),
      });
      const data = await res.json();
      if (data.error) terminalRef.current?.printError(data.error);
    } catch (err) {
      terminalRef.current?.printError(err.message || String(err));
    }
  };

  const stopProgram = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/stop", { method: "POST" });
      const data = await res.json();
      terminalRef.current?.announce(
        data.stopped ? "Program stopped." : "No program is running."
      );
    } catch (err) {
      terminalRef.current?.printError(err.message || String(err));
    }
  };

  /* ================= UI ================= */

  return (
    <div className="h-screen flex bg-[#181818] text-gray-200">
      <Sidebar
        onOpenFile={openFile}
        onRun={runCode}
        onFolderChanged={closeAllTabs}
        onTreeChanged={(tree) => {
          treeRef.current = tree;
        }}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <TabBar
          tabs={tabs}
          activeTab={activeTab}
          onSetActive={setActiveTab}
          onClose={closeTab}
        />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col border-r border-gray-700 min-w-0">
            <div className="flex-1 bg-[#1e1e1e] relative">
              {currentTab?.type === "welcome" || !currentModel ? (
                <Welcome onOpenFolder={handleOpenFolder} />
              ) : (
                <Editor ref={editorRef} model={currentModel} />
              )}

              <VoiceController
                editorRef={editorRef}
                terminalRef={terminalRef}
                currentModel={currentModel}
                onRunRequested={runCode}
                onStopRequested={stopProgram}
                onOpenFileRequested={openFileByName}
                onUntitledRequested={openUntitled}
              />
            </div>

            <Terminal ref={terminalRef} />
          </div>

          <RightPanel editorRef={editorRef} model={currentModel} />
        </div>

        <StatusBar onRun={runCode} onStop={stopProgram} />
      </main>
    </div>
  );
}
