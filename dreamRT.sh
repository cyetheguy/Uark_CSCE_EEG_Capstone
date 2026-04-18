#!/bin/bash
# EEG App launcher for macOS 
# First time: chmod +x dreamRT.sh
# Run from project root: ./dreamRT.sh   
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --install: install Python deps and frontend npm packages (Python/Node must already be installed)
for arg in "$@"; do
    if [ "$arg" = "--update" ]; then
        echo "update"
    fi
    if [ "$arg" = "--install" ]; then
        echo "Installing..."
        # Python / pip (use python3 on Mac)
        python3 -m ensurepip --upgrade 2>/dev/null || true
        python3 -m pip install --upgrade pip
        python3 -m pip install pycryptodome Flask flask-cors
        # Frontend
        cd frontend
        npm install
        npm install vite @vitejs/plugin-react --save-dev
        npm audit fix
        cd ..
        echo "Install finished."
        exit 0
    fi
done

# Check for Python (python3 on Mac)
if command -v python3 &>/dev/null; then
    PYTHON_CMD=python3
elif command -v python &>/dev/null; then
    PYTHON_CMD=python
else
    echo "ERROR: Python is not installed or not in PATH."
    echo "Install from https://www.python.org/ or: brew install python3"
    echo "Then run: ./dreamRT.sh --install"
    exit 1
fi

# Check for Node/npm
if ! command -v npm &>/dev/null; then
    echo "ERROR: Node.js/npm is not installed or not in PATH."
    echo "Install from https://nodejs.org/ or: brew install node"
    echo "Then run: ./dreamRT.sh --install"
    exit 1
fi

# Install frontend deps if missing
if [ ! -d "frontend/node_modules" ]; then
    echo ""
    echo "========================================"
    echo "Frontend dependencies not found."
    echo "Installing npm packages..."
    echo "========================================"
    echo ""
    cd frontend
    npm install
    cd ..
    echo ""
    echo "Dependencies installed successfully!"
    echo ""
fi

echo ""
echo "========================================"
echo "Starting EEG Application..."
echo "========================================"
echo ""

# Start backend in background (same folder as .bat: backend runs separately)
$PYTHON_CMD backend/main.py &
BACKEND_PID=$!
echo "Backend started (PID $BACKEND_PID). Frontend starting in this window."
echo ""

# Start frontend in this terminal (so you see logs)
cd frontend
npm run dev

# When frontend stops (Ctrl+C), optionally kill backend
trap "kill $BACKEND_PID 2>/dev/null" EXIT
