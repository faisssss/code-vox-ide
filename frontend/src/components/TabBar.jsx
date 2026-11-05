import React from "react";
import { VscClose } from "react-icons/vsc";

export default function TabBar({ tabs, activeTab, onSetActive, onClose }) {
  return (
    <div className="flex bg-[#202020] border-b border-[#2c2c2c] text-gray-300">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`flex items-center px-1 transition ${
            activeTab === tab.id
              ? "bg-[#1b1b1b] text-white"
              : "hover:bg-[#2d2d2d]"
          }`}
        >
          <button
            onClick={() => onSetActive(tab.id)}
            aria-current={activeTab === tab.id ? "page" : undefined}
            className="bg-transparent truncate max-w-[140px]"
          >
            {tab.title}
          </button>

          {tab.id !== "welcome" && (
            <button
              onClick={() => onClose(tab.id)}
              aria-label={`Close ${tab.title}`}
              className="bg-transparent hover:text-white"
            >
              <VscClose size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
