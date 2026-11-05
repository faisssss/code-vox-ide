# CodeVox: Voice-Assisted IDE

CodeVox helps visually impaired programmers write, edit and run Python by voice. You speak, and Google Gemini writes the code or your words are typed into the editor. A small local server runs the program, and results are read aloud.

## Setup

You need Python 3.10+, Node.js 20+ and Chrome or Edge (voice control and folder access need them).

**1. Get a Gemini API key** at <https://aistudio.google.com/apikey>.

**2. Start the backend** in one terminal:

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env       # macOS/Linux: cp .env.example .env
# Now put your key in backend/.env
python app.py
```

**3. Start the frontend** in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

**4. Open** <http://localhost:5173>. The backend only accepts requests from this address.

## Using it

Press **Alt+V** or the mic button and speak. With **Hands-free mode** on, the mic keeps listening.

| Say | What happens |
| --- | --- |
| `run` / `run the code` | Runs the current file |
| `stop` / `stop the program` | Stops the running program |
| `undo` | Undoes the last change |
| `open file main dot py` | Opens a file from the open folder |

**Full program mode:** anything else is sent to Gemini, and the code is added to the end of the file. Say `undo` to remove it.

**Line-by-line mode:** your words are typed, with symbols converted (`x equals True` becomes `x = True`). You can also say `cursor left/right/up/down`, `backspace`, `new line`, `go to line 5`, `delete line 5`, or `replace line 5 with x equals 1`.

Opening a folder needs a click or keyboard press because the browser requires it. Edits are saved automatically. Untitled tabs are not saved to disk.

## Limits

- Programs run in a temporary folder, not the folder you opened, so they cannot read files or import modules next to them.
- Programs run with your full user permissions. Only run code you trust.
- This is built for one person on their own computer. Do not host it for others.

## Tests

```bash
cd backend && python -m unittest test_app
cd frontend && npm test
```

## Tech stack

React, Vite, Tailwind CSS, Monaco Editor and the Web Speech API on the frontend. Python, Flask and the Google Gen AI SDK on the backend.

## Authors

Janvi Prince, Mohammed Faisal, Jeevan George, Jesse Jomon
