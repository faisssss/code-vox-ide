// src/components/Editor.jsx
import React, { forwardRef, useEffect } from "react";
import MonacoEditor from "@monaco-editor/react";

const Editor = forwardRef(({ model }, ref) => {
  // A closed editor must not stay reachable, or voice and Run would use a dead one.
  useEffect(() => () => {
    ref.current = null;
  }, [ref]);

  return (
    <MonacoEditor
      height="100%"
      theme="vs-dark"
      path={model.uri.toString()}
      keepCurrentModel
      onMount={(editor) => {
        ref.current = editor;
      }}
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14,
        ariaLabel: "Code editor",
      }}
    />
  );
});

export default Editor;
