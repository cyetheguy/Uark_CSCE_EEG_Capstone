from flask import Flask, send_file, jsonify, send_from_directory
from flask_cors import CORS
import json
from pathlib import Path
import os

app = Flask(__name__)
CORS(app)

GRAPH_DIR = Path("eeg_graphs")
GRAPH_DIR.mkdir(exist_ok=True)

@app.route('/api/sessions')
def get_sessions():
    """Get list of available EEG sessions."""
    sessions = []
    for session_dir in GRAPH_DIR.iterdir():
        if session_dir.is_dir():
            metadata_file = session_dir / "metadata.json"
            if metadata_file.exists():
                with open(metadata_file) as f:
                    metadata = json.load(f)
                sessions.append({
                    "id": session_dir.name,
                    "name": metadata.get("session_id", session_dir.name),
                    "created_at": metadata.get("created_at"),
                    "edf_file": metadata.get("edf_file"),
                    "num_signals": len(metadata.get("signals", []))
                })
    return jsonify(sessions)

@app.route('/api/session/<session_id>')
def get_session(session_id):
    """Get details for a specific session."""
    session_dir = GRAPH_DIR / session_id
    if not session_dir.exists():
        return jsonify({"error": "Session not found"}), 404
    
    # Load metadata
    metadata_file = session_dir / "metadata.json"
    if metadata_file.exists():
        with open(metadata_file) as f:
            metadata = json.load(f)
    else:
        metadata = {}
    
    # Find all graphs
    graphs = []
    for file in session_dir.iterdir():
        if file.suffix == '.png':
            graphs.append({
                "filename": file.name,
                "path": f"/api/graph/{session_id}/{file.name}",
                "created_at": file.stat().st_mtime
            })
    
    return jsonify({
        "id": session_id,
        "metadata": metadata,
        "graphs": sorted(graphs, key=lambda x: x["created_at"])
    })

@app.route('/api/graph/<session_id>/<filename>')
def get_graph(session_id, filename):
    """Serve a specific graph image."""
    session_dir = GRAPH_DIR / session_id
    if not session_dir.exists():
        return "Graph not found", 404
    
    return send_from_directory(str(session_dir), filename)

@app.route('/api/live-updates/<session_id>')
def live_updates(session_id):
    """SSE endpoint for live graph updates."""
    session_dir = GRAPH_DIR / session_id
    if not session_dir.exists():
        return "Session not found", 404
    
    def generate():
        import time
        last_check = 0
        
        while True:
            # Check for new graphs
            graphs = []
            for file in session_dir.iterdir():
                if file.suffix == '.png' and file.stat().st_mtime > last_check:
                    graphs.append(file.name)
                    last_check = max(last_check, file.stat().st_mtime)
            
            if graphs:
                yield f"data: {json.dumps({'new_graphs': graphs})}\n\n"
            
            time.sleep(2)  # Check every 2 seconds
    
    return Response(generate(), mimetype='text/event-stream')

if __name__ == '__main__':
    app.run(debug=True, port=5001)