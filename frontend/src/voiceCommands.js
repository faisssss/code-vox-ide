// Pure speech parsing, kept free of React and Monaco so it can be tested directly.

export function isRunCommand(text) {
  return /^(please )?run( it| this| code| the code| program| the program)?( please)?$/i.test(text.trim());
}

export function isStopCommand(text) {
  return /^(please )?stop( it| this| running| program| the program)?( please)?$/i.test(text.trim());
}

export function isUndoCommand(text) {
  return /^undo( that)?$/i.test(text.trim());
}

// "open file main dot py" -> "main.py"
export function parseOpenFile(text) {
  const match = text.trim().match(/^open file (.+)$/i);
  if (!match) return null;
  return match[1].replace(/\s+dot\s+/gi, ".").replace(/\s+/g, " ").trim();
}

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

// Returns { action, line, content } for "go to / delete / replace line N". line is
// null when the number was not understood, so the caller can say so.
export function parseLineCommand(text) {
  const match = text.trim().match(/^(go to|delete|replace) line(?:\s+(\S+))?(?:\s+with\s+(.*))?$/i);
  if (!match) return null;
  const word = (match[2] || "").toLowerCase();
  const line = /^\d+$/.test(word) ? parseInt(word, 10) : NUMBER_WORDS[word] || null;
  return { action: match[1].toLowerCase(), line, content: match[3] ?? "" };
}

const SPOKEN_SYMBOLS = {
  tab: "\t",
  "new line": "\n",
  "next line": "\n",
  enter: "\n",
  colon: ":",
  semicolon: ";",
  comma: ",",
  period: ".",
  dot: ".",
  "open bracket": "(",
  "close bracket": ")",
  "open square bracket": "[",
  "close square bracket": "]",
  "open curly": "{",
  "close curly": "}",
  equals: "=",
  plus: "+",
  minus: "-",
  multiply: "*",
  times: "*",
  divide: "/",
};

// Case is kept because Python needs it: True, None, MyClass.
export function spokenToCode(text) {
  let result = text
    .replace(/\bdouble quotes\b/gi, '""')
    .replace(/\bsingle quotes\b/gi, "''")
    .replace(/\bdouble quote\b/gi, '"')
    .replace(/\bsingle quote\b/gi, "'");

  for (const [spoken, symbol] of Object.entries(SPOKEN_SYMBOLS)) {
    result = result.replace(new RegExp(`\\b${spoken}\\b`, "gi"), symbol);
  }
  return result;
}

export function parseOutline(text) {
  const items = [];
  text.split("\n").forEach((line, i) => {
    const match = line.match(/^\s*(async\s+def|def|class)\s+(\w+)/);
    if (match) {
      items.push({
        type: match[1] === "class" ? "class" : "function",
        name: match[2],
        line: i + 1,
      });
    }
  });
  return items;
}
