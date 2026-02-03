import sys
from flask import Flask, request, jsonify
from flask_cors import CORS

# Import your existing custom modules
# Ensure these files are in the same folder or properly referenced in PYTHONPATH
import debug
from debug import printDebug
from crypto_usr_test import authenticate

app = Flask(__name__)
CORS(app)  # Enables the React frontend to talk to this Python backend

@app.route('/api/login', methods=['POST'])
def login():
    # 1. Get the JSON data sent from React
    data = request.get_json()
    
    username = data.get('username')
    password = data.get('password')

    # 2. PRINT CREDENTIALS TO CONSOLE (As requested)
    printDebug("LOGIN REQUEST:")
    printDebug(f"\tUsername: {username}")
    printDebug(f"\tPassword: {password}")

    # 3. Verify against your existing authentication logic
    printDebug(f"Verification: {authenticate(username, password)}")
    if authenticate(username, password):
        return jsonify({"success": 1, "message": "Login successful"}), 200
    else:
        return jsonify({"success": 0, "message": "Invalid credentials"}), 200

if __name__ == "__main__":
    # Handle your existing debug flags
    for arg in sys.argv[1:]:
        if arg == "--debug":
            debug.setDebug(debug.DEBUG)
        if arg == "--debug-gui":
            debug.setDebug(debug.DEBUG | debug.GUI)

    print("Back end running\n\tDO NOT CLOSE THIS WINDOW!!!")
    
    # Run the Flask server
    # Note: We disable the CLI loop here so the Server can take control
    app.run(debug=True, port=5000)