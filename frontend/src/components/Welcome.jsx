// src/components/Welcome.jsx
import React from "react";
import { FiMic, FiFolder } from "react-icons/fi";

export default function Welcome({ onOpenFolder }) {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="text-center max-w-2xl p-6">
        <h1 className="text-5xl font-extrabold text-white mb-2">
          CodeVox
        </h1>

        <p className="text-gray-400 mb-6 text-lg">
          Voice-first coding environment.
          <br />
          Speak, edit, and run programs hands-free or with keyboard.
          <br />
          Press Alt+V anywhere to use the microphone.
        </p>

        <div className="flex justify-center gap-3">
          <button
            className="flex items-center gap-2 bg-[#0e639c] hover:bg-[#1177c2] px-4 py-2 rounded text-white"
            onClick={onOpenFolder}
          >
            <FiFolder aria-hidden="true" /> Open Folder
          </button>

          <button
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-white"
            onClick={() => window.dispatchEvent(new Event("codevox-toggle-mic"))}
          >
            <FiMic aria-hidden="true" /> Start Voice Mode
          </button>
        </div>
      </div>
    </div>
  );
}
