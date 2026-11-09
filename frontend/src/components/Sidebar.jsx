// src/components/Sidebar.jsx
import React, { useState, useEffect, useRef } from "react";
import {
  FiFolder,
  FiFile,
  FiFolderPlus,
  FiFilePlus,
  FiChevronDown,
  FiChevronRight,
  FiPlay
} from "react-icons/fi";
import { VscFolderOpened } from "react-icons/vsc";

// Huge generated folders would make opening a project take minutes.
const SKIPPED_FOLDERS = new Set([
  "node_modules", ".git", "__pycache__", ".venv", "venv", "dist",
]);

async function readDirectory(dirHandle, basePath) {
  const entries = [];

  for await (const entry of dirHandle.values()) {
    const fullPath = basePath
      ? `${basePath}/${entry.name}`
      : entry.name;

    if (entry.kind === "directory") {
      if (SKIPPED_FOLDERS.has(entry.name)) continue;
      const children = await readDirectory(entry, fullPath);
      entries.push({
        name: entry.name,
        type: "folder",
        path: fullPath,
        handle: entry,
        children,
      });
    } else {
      entries.push({
        name: entry.name,
        type: "file",
        path: fullPath,
        handle: entry,
      });
    }
  }

  return entries.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === "folder" ? -1 : 1;
  });
}

export default function Sidebar({ onOpenFile, onRun, onFolderChanged, onTreeChanged }) {
  const [tree, setTree] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [rootHandle, setRootHandle] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(null);

  const loadTree = async (root) => {
    const structure = await readDirectory(root, "");
    setTree(structure);
    onTreeChanged?.(structure);
  };

  const openWorkspace = async (externalRoot) => {
    try {
      const root = externalRoot || await window.showDirectoryPicker({ mode: "readwrite" });
      if (!root) return;

      await onFolderChanged?.();
      setRootHandle(root);
      setSelectedFolder(root);
      setExpanded({});
      await loadTree(root);
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error(err);
      }
    }
  };

  // The listener always calls the newest openWorkspace, without re-subscribing.
  const openWorkspaceRef = useRef(openWorkspace);
  useEffect(() => {
    openWorkspaceRef.current = openWorkspace;
  });

  useEffect(() => {
    const listener = (e) => openWorkspaceRef.current(e.detail);
    window.addEventListener("codevox-open-folder", listener);
    return () =>
      window.removeEventListener("codevox-open-folder", listener);
  }, []);

  const createFile = async () => {
    if (!selectedFolder) return;
    const name = prompt("File name:");
    if (!name) return;
    await selectedFolder.getFileHandle(name, { create: true });
    await loadTree(rootHandle);
  };

  const createFolder = async () => {
    if (!selectedFolder) return;
    const name = prompt("Folder name:");
    if (!name) return;
    await selectedFolder.getDirectoryHandle(name, { create: true });
    await loadTree(rootHandle);
  };

  const toggle = (path) =>
    setExpanded((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));

  const renderTree = (nodes) =>
    nodes.map((node) => {
      if (node.type === "folder") {
        const isOpen = expanded[node.path];

        return (
          <div key={node.path}>
            <button
              aria-expanded={!!isOpen}
              className="w-full bg-transparent text-left flex items-center gap-2 px-2 py-1 hover:bg-[#2a2a2a] cursor-pointer"
              onClick={() => {
                toggle(node.path);
                setSelectedFolder(node.handle);
              }}
            >
              {isOpen ? <FiChevronDown aria-hidden="true" size={14} /> : <FiChevronRight aria-hidden="true" size={14} />}
              <FiFolder aria-hidden="true" size={14} className="text-yellow-400" />
              {node.name}
            </button>

            {isOpen && node.children && (
              <div className="ml-4">
                {renderTree(node.children)}
              </div>
            )}
          </div>
        );
      }

      return (
        <button
          key={node.path}
          className="w-full bg-transparent text-left flex items-center gap-2 px-4 py-1 hover:bg-[#2a2a2a] cursor-pointer"
          onClick={() => onOpenFile(node.path, node.handle)}
        >
          <FiFile aria-hidden="true" size={14} className="text-blue-400" />
          {node.name}
        </button>
      );
    });

  return (
    <nav aria-label="File explorer" className="w-64 bg-[#181818] border-r border-[#2a2a2a] flex flex-col">
      <div className="px-3 py-2 flex justify-between border-b border-[#2a2a2a]">
        <span className="text-sm font-semibold text-gray-200">
          Explorer
        </span>

        <div className="flex gap-2">
          <button onClick={() => openWorkspace()} title="Open Folder" aria-label="Open Folder">
            <VscFolderOpened aria-hidden="true" size={16} />
          </button>
          <button onClick={createFolder} title="New Folder" aria-label="New Folder">
            <FiFolderPlus aria-hidden="true" size={16} />
          </button>
          <button onClick={createFile} title="New File" aria-label="New File">
            <FiFilePlus aria-hidden="true" size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto text-sm">
        {tree.length === 0 ? (
          <div className="text-gray-500 text-xs mt-4 text-center">
            No folder opened
          </div>
        ) : (
          renderTree(tree)
        )}
      </div>

      <div className="p-3 border-t border-[#2a2a2a]">
        <button
          onClick={onRun}
          className="w-full bg-[#0e639c] text-white py-2 rounded flex items-center justify-center gap-2"
        >
          <FiPlay aria-hidden="true" size={14} />
          Run
        </button>
      </div>
    </nav>
  );
}
