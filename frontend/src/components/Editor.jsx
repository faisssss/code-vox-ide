// src/components/Editor.jsx
import React, { forwardRef, useEffect, useRef } from "react";
import MonacoEditor from "@monaco-editor/react";

const Editor = forwardRef(({ model }, ref) => {
  const internalRef = useRef(null);

  function handleMount(editor) {
    internalRef.current = editor;
    if (ref) ref.current = editor;
  }

  useEffect(() => {
    return () => {
      if (internalRef.current) {
        try {
          internalRef.current.dispose();
        } catch {}
      }
    };
  }, []);

  if (!model) return null;

  return (
    <MonacoEditor
      key={model.id}
      height="100%"
      theme="vs-dark"
      onMount={handleMount}
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14,
      }}
      defaultLanguage="python"
      path={model.uri?.path}
      value={model.getValue()}
      onChange={(value) => {
        if (model && value !== undefined) {
          model.setValue(value);
        }
      }}
    />
  );
});

export default Editor;