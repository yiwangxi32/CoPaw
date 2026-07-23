$ErrorActionPreference = "Stop"

if (!(Test-Path ".\.venv")) {
  py -m venv .venv
}

.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m pip install email-validator

$env:PYTHONUNBUFFERED = "1"
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8787 --reload

