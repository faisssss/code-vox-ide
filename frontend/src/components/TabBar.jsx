import React from "react";
import { VscClose } from "react-icons/vsc";

export default function TabBar({ tabs, activeTab, onSetActive, onClose }) {
  return (
    <div className="flex bg-[#202020] border-b border-[#2c2c2c] text-gray-300">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => onSetActive(tab.id)}
          className={`flex items-center px-3 py-1 cursor-pointer transition ${
            activeTab === tab.id
              ? "bg-[#1b1b1b] text-white"
              : "hover:bg-[#2d2d2d]"
          }`}
        >
          <span className="mr-2 truncate max-w-[120px]">{tab.title}</span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
            className="hover:text-white"
          >
            <VscClose size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
