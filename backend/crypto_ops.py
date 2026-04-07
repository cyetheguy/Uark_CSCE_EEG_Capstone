import os
import json
import random
import string
from pathlib import Path
from typing import Any, Dict, List, Optional
from Crypto.Cipher import AES
from Crypto.Hash import SHA256
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Random import get_random_bytes
from debug import printDebug

BACKEND_ROOT: Path = Path(__file__).resolve().parent
USER_DIR: Path = BACKEND_ROOT / "user"
SESSIONS_DIR: Path = BACKEND_ROOT / "sessions"

USR_KEY: Optional[bytes] = None


def _list_usr_files() -> List[str]:
    if not USER_DIR.exists():
        return []
    return [str(p) for p in sorted(USER_DIR.glob("*.USR"))]


all_usr: List[str] = _list_usr_files()

def derive_key(password: str, salt: bytes) -> bytes:
    """Returns SHA-256 key from password and salt"""
    key: bytes = PBKDF2(password, salt, dkLen=32, count=200000, hmac_hash_module=SHA256)
    return key

def authenticate(input_username: str, input_password: str) -> bool:
    """
    Returns True  | authentication passed, global key established
    Returns False | authentication failed, global key not changed
    """
    global USR_KEY
    global all_usr

    if not all_usr:
        printDebug("[!] No .USR files found.")
        return False

    for file_path in all_usr:
        try:
            with open(file_path, "rb") as f:
                salt: bytes = f.read(16)
                nonce: bytes = f.read(16)
                tag: bytes = f.read(16)
                ciphertext: bytes = f.read()

            candidate_key: bytes = derive_key(input_password, salt)

            # Initialize AES with the derived key
            cipher = AES.new(candidate_key, AES.MODE_GCM, nonce=nonce)
            
            # Decrypt and Verify
            decrypted_bytes: bytes = cipher.decrypt_and_verify(ciphertext, tag)
            
            # Decode and check username
            user_data: Dict[str, Any] = json.loads(decrypted_bytes.decode('utf-8'))
            
            if user_data.get("username") == input_username:
                USR_KEY = candidate_key
                return True 
            
        except (ValueError, KeyError):
            # ValueError means the Key was wrong (Password mismatch)
            continue
    return False

def create_usr_file(username: str, password: str) -> bool:
    """
    Returns True  | file was created
    Returns False | file was not created
    """
    global all_usr

    # Verify that no usr currently exists
    if authenticate(username, password):
        return False
    
    # Filename creation
    filename: str = ""
    USER_DIR.mkdir(parents=True, exist_ok=True)

    while True:
        fname = "".join(random.choice(string.ascii_letters) for _ in range(8))
        candidate = USER_DIR / f"{fname}.USR"
        if not candidate.exists():
            break

    # Salt creation
    salt: bytes = get_random_bytes(16)
    
    # Get key from password and salt
    key: bytes = derive_key(password, salt)
    
    # Encrypt username and info
    data: bytes = json.dumps({"username": username, "bio": "Top Secret Data"}).encode('utf-8')
    cipher = AES.new(key, AES.MODE_GCM)
    nonce: bytes = cipher.nonce
    ciphertext, tag = cipher.encrypt_and_digest(data)
    
    # Write: Salt + Nonce + Tag + Ciphertext
    with open(candidate, "wb") as f:
        f.write(salt + nonce + tag + ciphertext)
        
    printDebug(f"[Setup] Created salted file '{candidate.name}' for user '{username}'")
    
    # Refresh the global list of users
    all_usr = _list_usr_files()
    return True

def encrypt_session(session: Dict[str, Any]) -> bool:
    """Encrypts a dictionary payload to an .eeg file using the active USR_KEY"""
    global USR_KEY
    if USR_KEY is None:
        printDebug("[!] Cannot encrypt: No USR_KEY established.")
        return False

    date_info: str = session.get('Time', 'unknown_time')

    # Create encoded JSON byte string
    data: bytes = json.dumps(session).encode('utf-8')

    # AES encryption
    cipher = AES.new(USR_KEY, AES.MODE_GCM)
    nonce: bytes = cipher.nonce
    ciphertext, tag = cipher.encrypt_and_digest(data)

    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    out_path: Path = SESSIONS_DIR / f"{date_info}.eeg"
    with open(out_path, "wb") as f:
        f.write(nonce + tag + ciphertext)
    return True

def list_user_sessions() -> List[str]:
    """Returns a list of .eeg filenames that the current user can successfully decrypt."""
    global USR_KEY
    valid_lists: List[str] = []
    
    if USR_KEY is None:
        return valid_lists

    if not SESSIONS_DIR.exists():
        return valid_lists

    for filepath in sorted(SESSIONS_DIR.glob("*.eeg")):
        with open(filepath, "rb") as f:
            nonce: bytes = f.read(16)
            tag: bytes = f.read(16)
            ciphertext: bytes = f.read()
            cipher = AES.new(USR_KEY, AES.MODE_GCM, nonce=nonce)
            try: 
                cipher.decrypt_and_verify(ciphertext, tag)
                valid_lists.append(filepath.name)
            except:
                continue
    return valid_lists

def decrypt_session(filename: str) -> Dict[str, Any]:
    """
    Reads, decrypts, and decodes a specific .eeg file using the active USR_KEY.
    Returns the parsed JSON dictionary.
    """
    global USR_KEY
    if USR_KEY is None:
        raise PermissionError("No active user session (USR_KEY is None).")
    
    base: str = os.path.basename(filename.replace("\\", "/"))
    filepath: Path = SESSIONS_DIR / base

    if not filepath.is_file():
        raise FileNotFoundError(f"Session file not found: {filepath}")

    with open(filepath, "rb") as f:
        nonce: bytes = f.read(16)
        tag: bytes = f.read(16)
        ciphertext: bytes = f.read()

    cipher = AES.new(USR_KEY, AES.MODE_GCM, nonce=nonce)
    
    try:
        decrypted_bytes: bytes = cipher.decrypt_and_verify(ciphertext, tag)
        session_data: Dict[str, Any] = json.loads(decrypted_bytes.decode('utf-8'))
        return session_data
    except Exception as e:
        raise ValueError(f"Failed to decrypt {filepath!s}. Key mismatch or corrupted file. Error: {e}")

if __name__ == "__main__":
    print("\n--- Front End Login ---")
    user_in = input("Enter Username: ")
    pass_in = input("Enter Password: ")

    is_authenticated = authenticate(user_in, pass_in)

    if is_authenticated:
        print("\n>> FRONT END: Access Granted. Session Key Established.")
    else:
        print("\n>> FRONT END: Access Denied. Credentials Rejected.")
        create_usr_file(user_in, pass_in)
        exit()

    test_data = {
        "name": "John Doe",
        "Time": "260117_1225",
        "is_employed": True,
        "hobbies": ["coding", "reading", "gaming"],
        "address": {
            "street": "123 Main St",
            "city": "Anytown"
        }
    }

    encrypt_session(test_data)
    print(f"Readable Sessions: {list_user_sessions()}")
    print(f"Decrypted Test Session: {decrypt_session('260117_1225.eeg')}")