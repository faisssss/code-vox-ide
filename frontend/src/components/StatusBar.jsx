import React from "react";
import { FiPlay, FiMic } from "react-icons/fi";

export default function StatusBar({ onRun }) {
  return (
    <div className="h-8 bg-[#1a1a1a] border-t border-[#2b2b2b] text-gray-300 flex items-center justify-between px-4 text-xs">
      <div className="flex items-center gap-2">
        ● Python
      </div>

      <div className="flex gap-2">
        <button
          onClick={onRun}
          className="flex items-center gap-1 bg-[#0e639c] hover:bg-[#1177c2] text-white px-2 py-1 rounded"
        >
          <FiPlay /> Run
        </button>
      </div>
    </div>
  );
}
