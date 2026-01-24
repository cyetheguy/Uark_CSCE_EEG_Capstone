/*
Author: Will Taylor

Info:
-Receiver for bluetooth low energy device communication between windows devices

BIG TODOS:
-Add back and forth exchange so it can have keys for encrypting
-Add some form of longterm key storage for application level bonding
-Clarify usage of size_t vs uint64_t ESP 32 is a 32 bit not 64 so there may be issues when porting over
-Get ride of all the using namespace std and other large namespaces
-Some things in header files need to be inline because they're implemented in the header find them
-Some things maybe can be used as structs and not full fledged classes
-list devices is so bad i dont like it requries so many roundabouts and caveats there has to be a better way its ugly find it

*/

//-------------------------------------------------------------------------------------------------------------

#include "DeviceBLEModule.h"

using std::cout;
using std::endl;
using std::cin;
using std::string;

int main(){    

    cout << "Hello World" << endl;

    DeviceBLEModule d;

    bool gettingInput = true;
    string userInput;
    string message;

    cout << "Please provide one of the following commands:" <<
            "\nStart [For broadcasting for devices]" <<
            "\nStop [To stop discovering devices]" <<
            "\nSend [Send a message]" <<
            "\nQuit [Quits the program]" <<
            "\nHelp [Relists all these commands]" << 
            "\n[NOTE: program automatically will connect with scanned devices that match a certain connection critera bypassing need to even use connect(param)" << endl;

    while(gettingInput){

        cin >> userInput;

        transform(userInput.begin(), userInput.end(), userInput.begin(), ::tolower);

        if(userInput == "start"){

            d.Start();

        }else if(userInput == "stop"){

            d.Stop();

        }else if(userInput == "send"){

            cout << "Please input a message to send" << endl;
            cin >> userInput;
            d.plainSendMessage(userInput);

        }else if(userInput == "help"){
            
            cout << "Please provide one of the following commands:" <<
                    "\nStart [For broadcasting for devices]" <<
                    "\nStop [To stop discovering devices]" <<
                    "\nQuit [Quits the program]" <<
                    "\nHelp [Relists all these commands]" << 
                    "\n[NOTE: program automatically will connect with scanned devices that match a certain connection critera bypassing need to even use connect(param)" << endl;

        }else if(userInput == "quit"){

            gettingInput = false;

        }else{

            cout << "Command provided was not one that is listed" << endl;

        }
    }

    return 0;

}