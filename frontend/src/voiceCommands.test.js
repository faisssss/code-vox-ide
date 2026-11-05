import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRunCommand,
  isStopCommand,
  isUndoCommand,
  parseLineCommand,
  parseOpenFile,
  parseOutline,
  spokenToCode,
} from "./voiceCommands.js";

test("run only matches a real run command", () => {
  for (const yes of ["run", "Run it", "run the code", "please run the program"]) {
    assert.equal(isRunCommand(yes), true, yes);
  }
  for (const no of [
    "write a function to truncate a string",
    "create a running total",
    "sort a list of prunes",
    "run a loop ten times",
  ]) {
    assert.equal(isRunCommand(no), false, no);
  }
});

test("stop and undo only match whole commands", () => {
  assert.equal(isStopCommand("stop the program"), true);
  assert.equal(isStopCommand("write a stop watch"), false);
  assert.equal(isUndoCommand("undo"), true);
  assert.equal(isUndoCommand("write an undo stack"), false);
});

test("open file understands spoken dots", () => {
  assert.equal(parseOpenFile("open file main dot py"), "main.py");
  assert.equal(parseOpenFile("Open file main.py"), "main.py");
  assert.equal(parseOpenFile("open the door"), null);
});

test("line commands read the right number", () => {
  assert.deepEqual(parseLineCommand("replace line 3 with x equals 5"), {
    action: "replace",
    line: 3,
    content: "x equals 5",
  });
  assert.equal(parseLineCommand("replace line 2 with without equals 1").content, "without equals 1");
  assert.equal(parseLineCommand("go to line five").line, 5);
  assert.equal(parseLineCommand("delete line 12").line, 12);
  assert.equal(parseLineCommand("delete line").line, null);
  assert.equal(parseLineCommand("print line 3"), null);
});

test("spoken symbols keep the case Python needs", () => {
  assert.equal(spokenToCode("x equals True"), "x = True");
  assert.equal(spokenToCode("class MyClass colon"), "class MyClass :");
  assert.equal(spokenToCode("print open bracket double quotes close bracket"), 'print ( "" )');
  assert.equal(spokenToCode("A open square bracket 0 close square bracket"), "A [ 0 ]");
});

test("outline finds functions, async functions and classes", () => {
  const text = "import os\nclass Foo(Bar):\n    def go(self):\n        pass\nasync def fetch():\n    pass\n# def nope\n";
  assert.deepEqual(parseOutline(text), [
    { type: "class", name: "Foo", line: 2 },
    { type: "function", name: "go", line: 3 },
    { type: "function", name: "fetch", line: 5 },
  ]);
});
