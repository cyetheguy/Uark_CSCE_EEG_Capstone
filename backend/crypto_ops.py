import os
import json
import glob
from Crypto.Cipher import AES
from Crypto.Hash import SHA256
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Random import get_random_bytes
import random
import string
from debug import printDebug


USR_KEY:bytes = None
all_usr: list[str] = glob.glob("backend/user/*.USR")

def derive_key(password:str, salt:bytes) -> bytes:

    # Returns SHA-256 key from password and salt

    key = PBKDF2(password, salt, dkLen=32, count=200000, hmac_hash_module=SHA256)
    return key

def authenticate(input_username:str, input_password:str) -> bool:
    global USR_KEY
    global all_usr

    # Returns True  | authentication passed, global key established
    # Returns False | authentication failed, global key not changed
    
    if not all_usr:
        printDebug("[!] No .USR files found.")
        return False

    for file_path in all_usr:
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
            user_data: dict[str, Any] = json.loads(decrypted_bytes.decode('utf-8'))
            
            if user_data.get("username") == input_username:
                USR_KEY = candidate_key
                return True 
            
        except (ValueError, KeyError):
            # ValueError means the Key was wrong (Password mismatch)
            continue
    return False

def create_usr_file(username:str, password:str) -> bool:
    global all_usr

    # Returns True  | file was created
    # Returns False | file was not created

    # Verify that no usr currently exists
    if(authenticate(username, password)):
        return False
    
    # Filename creation
    filename:str = None
    while(True):
        filename = "".join(random.choice(string.ascii_letters) for i in range (8))
        filename.join(".USR")
        if filename not in all_usr:
            break


    # Salt creation
    salt:bytes = get_random_bytes(16)
    
    # Get key from password and salt
    key:bytes = derive_key(password, salt)
    
    # Encrypt username and info
    data:bytes = json.dumps({"username": username, "bio": "Top Secret Data"}).encode('utf-8')
    cipher = AES.new(key, AES.MODE_GCM)
    nonce:bytes = cipher.nonce
    ciphertext, tag = cipher.encrypt_and_digest(data)
    
    # Write: Salt + Nonce + Tag + Ciphertext
    with open(f"backend/user/{filename}.USR", "wb") as f:
        f.write(salt + nonce + tag + ciphertext)
        
    printDebug(f"[Setup] Created salted file '{filename}' for user '{username}'")
    return True

def encrypt_session(session:dict) -> bool:
    global USR_KEY

    # Generate Filename from filetype <- MAKE SURE FILENAMES DON'T OVERLAP
    date_info = session['Time']

    # Create encoded JSON byte string
    data:bytes = json.dumps(session).encode('utf-8')

    # AES encryption
    cipher = AES.new(USR_KEY, AES.MODE_GCM)
    nonce:bytes = cipher.nonce
    ciphertext, tag = cipher.encrypt_and_digest(data)

    # Write file to /backend/sessions/
    with open(f"backend/sessions/{date_info}.eeg", "wb") as f:
        f.write(nonce + tag + ciphertext)
    return True

def decrypt_sessions() -> list[str]:
    global USR_KEY

    # all files created from user will show up in this list
    valid_lists: list[str] = []

    for filename in glob.glob("backend/sessions/*.eeg"):
        with open(filename, "rb") as f:
            nonce:bytes = f.read(16)
            tag:bytes = f.read(16)
            ciphertext:bytes = f.read()
            cipher = AES.new(USR_KEY, AES.MODE_GCM, nonce=nonce)
            try: 
                cipher.decrypt_and_verify(ciphertext, tag)
                valid_lists.append(filename)
            except:
                continue
    return valid_lists
        



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
    }}

    encrypt_session(test_data)
    print(decrypt_sessions())
