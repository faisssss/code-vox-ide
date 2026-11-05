// Saves one file: waits for a pause in typing and never runs two writes at once,
// so an older write can never finish last and overwrite newer text.
export function createSaver(fileHandle, onError, delayMs = 500) {
  let timer = null;
  let latest = null;
  let writing = null;

  async function write() {
    while (latest !== null) {
      const content = latest;
      latest = null;
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
      } catch (err) {
        onError(err);
      }
    }
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    if (!writing) {
      writing = write().finally(() => {
        writing = null;
      });
    }
    return writing;
  }

  return {
    save(content) {
      latest = content;
      clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
    hasUnsavedChanges: () => latest !== null || writing !== null,
  };
}
