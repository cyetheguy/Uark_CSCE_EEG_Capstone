import debug
import sys


from crypto_usr_test import *


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        if arg == "--debug":
            debug.setDebug(debug.DEBUG)
            continue
        if arg == "--debug-gui":
            debug.setDebug(debug.DEBUG | debug.GUI)
            continue
    
    if(debug.getDebug(debug.GUI)):
        while(True):
            username = input("Username >> ")
            password = input("Password >> ")
            if(authenticate(username, password)):
                break
            else:
                print("USER AUTHENTICATION FAILED!!!")