"""Start the Disaster Management System FastAPI server for local development."""

import os
from pathlib import Path
import sys

import uvicorn


BACKEND_DIR = Path(__file__).resolve().parent
APP_DIR = BACKEND_DIR / "app"

# Ensure ``app.main`` resolves even when this file is launched from the repo root.
backend_path = str(BACKEND_DIR)
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)
python_paths = os.environ.get("PYTHONPATH", "").split(os.pathsep)
if backend_path not in python_paths:
    os.environ["PYTHONPATH"] = os.pathsep.join(filter(None, [backend_path, *python_paths]))
os.chdir(BACKEND_DIR)


def main() -> None:
    reload_enabled = os.getenv("RELOAD", "true").strip().lower() in {"1", "true", "yes", "on"}
    uvicorn.run(
        "app.main:app",
        app_dir=backend_path,
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=reload_enabled,
        reload_dirs=[str(APP_DIR)] if reload_enabled else None,
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )


if __name__ == "__main__":
    main()
