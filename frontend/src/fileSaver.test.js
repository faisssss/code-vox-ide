import { test } from "node:test";
import assert from "node:assert/strict";
import { createSaver } from "./fileSaver.js";

function fakeFile({ failFirst = false } = {}) {
  const file = { content: "", active: 0, maxActive: 0, writes: 0 };
  file.createWritable = async () => {
    file.writes += 1;
    if (failFirst && file.writes === 1) throw new Error("denied");
    file.active += 1;
    file.maxActive = Math.max(file.maxActive, file.active);
    let pending = "";
    return {
      write: async (text) => {
        pending = text;
        await new Promise((r) => setTimeout(r, 5));
      },
      close: async () => {
        file.content = pending;
        file.active -= 1;
      },
    };
  };
  return file;
}

test("many quick edits become one write with the newest text", async () => {
  const file = fakeFile();
  const saver = createSaver(file, assert.fail, 10);
  ["a", "ab", "abc"].forEach((text) => saver.save(text));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(file.content, "abc");
  assert.equal(file.writes, 1);
  assert.equal(saver.hasUnsavedChanges(), false);
});

test("an edit during a write is saved afterwards, never at the same time", async () => {
  const file = fakeFile();
  const saver = createSaver(file, assert.fail, 0);
  saver.save("first");
  const first = saver.flush();
  saver.save("second");
  await first;
  await saver.flush();
  assert.equal(file.content, "second");
  assert.equal(file.maxActive, 1);
});

test("flush saves right away and failures are reported", async () => {
  const errors = [];
  const file = fakeFile({ failFirst: true });
  const saver = createSaver(file, (err) => errors.push(err.message), 10000);
  saver.save("text");
  assert.equal(saver.hasUnsavedChanges(), true);
  await saver.flush();
  assert.deepEqual(errors, ["denied"]);
});
