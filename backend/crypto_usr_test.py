import os
import json
import glob
from Crypto.Cipher import AES
from Crypto.Hash import SHA256
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Random import get_random_bytes


def derive_key(password:str, salt:bytes) -> bytes:

    key = PBKDF2(password, salt, dkLen=32, count=200000, hmac_hash_module=SHA256)
    return key

# --- 2. Back End Logic ---
def authenticate(input_username:str, input_password:str) -> bool:
    
    usr_files: List[str] = glob.glob("backend/user/*.USR")
    
    if not usr_files:
        print("[!] No .USR files found.")
        return False

    for file_path in usr_files:
        try:
            with open(file_path, "rb") as f:
                salt:bytes = f.read(16)
                nonce:bytes = f.read(16)
                tag:bytes = f.read(16)
                ciphertext:bytes = f.read()

            candidate_key:bytes = derive_key(input_password, salt)

            # Initialize AES with the derived key
            cipher = AES.new(candidate_key, AES.MODE_GCM, nonce=nonce)
            
            # Decrypt and Verify
            decrypted_bytes:bytes = cipher.decrypt_and_verify(ciphertext, tag)
            
            # Decode and check username
            user_data: Dict[str, Any] = json.loads(decrypted_bytes.decode('utf-8'))
            
            if user_data.get("username") == input_username:
                return True 
            
        except (ValueError, KeyError):
            # ValueError means the Key was wrong (Password mismatch)
            continue
    return False

# --- 3. Helper: Create a Salted User File ---
def create_user_file(username:str, password:str, filename:str) -> None:
    """
    Creates an encrypted .USR file with a unique salt.
    """
    # 1. Generate a random 16-byte salt
    salt:bytes = get_random_bytes(16)
    
    # 2. Derive the key using the password and the NEW salt
    key:bytes = derive_key(password, salt)
    
    # 3. Encrypt the data
    data:bytes = json.dumps({"username": username, "bio": "Top Secret Data"}).encode('utf-8')
    cipher = AES.new(key, AES.MODE_GCM)
    nonce:bytes = cipher.nonce
    ciphertext, tag = cipher.encrypt_and_digest(data)
    
    # 4. Write: Salt + Nonce + Tag + Ciphertext
    with open(filename, "wb") as f:
        f.write(salt + nonce + tag + ciphertext)
        
    print(f"[Setup] Created salted file '{filename}' for user '{username}'")

# --- 4. Front End Simulation ---
def main():
    print("--- Security System Setup (Salted) ---")
    # We can create two users with the SAME password to prove salts work
    ##create_user_file("alice", "password123", "backend/user/alice.USR")
    ##create_user_file("bob",   "password123", "backend/user/bob.USR")
    print("-" * 30)

    print("\n--- Front End Login ---")
    user_in = input("Enter Username: ")
    pass_in = input("Enter Password: ")

    # Send credentials to Back End
    is_authenticated = backend_authenticate(user_in, pass_in)

    if is_authenticated:
        print("\n>> FRONT END: Access Granted. Session Key Established.")
    else:
        print("\n>> FRONT END: Access Denied. Credentials Rejected.")

if __name__ == "__main__":
    main()