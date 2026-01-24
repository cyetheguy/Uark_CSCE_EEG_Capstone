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

#include "ConnectionManager.h"
#include "SecurityManager.h"

using namespace std;
using namespace winrt;
using namespace Windows::Storage::Streams;
using namespace Windows::Devices::Bluetooth;
using namespace Windows::Devices::Bluetooth::Advertisement;
using namespace Windows::Devices::Bluetooth::GenericAttributeProfile;

int main(){    

    ConnectionManager CM;
    SecurityManager SM;

    cout << "Hello World" << endl;

    bool gettingInput = true;
    string userInput;

    cout << "Please provide one of the following commands: \nConnect(DeviceName) [For connecting with device]\nInfo [returns information of your machine]\nSend [Send a message to a connected device]\nBroadcast [For other devices to connect]\nList [Lists devices as they pop up for connection]\nQuit [Quits the program]" << endl;

    while(gettingInput){

        cin >> userInput;

        transform(userInput.begin(), userInput.end(), userInput.begin(), ::tolower);

        if(userInput == "connect"){

            cout << "Please provide ID of device" << endl;

            cin >> userInput;

            CM.connect(winrt::to_hstring(userInput));

        }else if(userInput == "info"){
            
            wcout << "Your Bluetooth address is " << hex << CM.getBluetoothAddress() << "\nYour device's name is: " << CM.getDeviceName() << endl;
            
        }else if(userInput == "send"){
            
            cout << "Please input a message to send" << endl;

            cin >> userInput;

            CM.sendMessage(userInput);
            
        }else if(userInput == "broadcast"){

            CM.advertise();

        }else if(userInput == "list"){

            CM.listDevices();

            this_thread::sleep_for(3s);

        }else if(userInput == "help"){
            
            cout << "Please provide one of the following commands: \nConnect(DeviceName) [For connecting with device]\nAddress [returns bluetooth address of your machine]\nSend [Send a message to a connected device]\nBroadcast [For other devices to connect]\nList [Lists devices as they pop up for connection]\nQuit [Quits the program]" << endl;


        }else if(userInput == "quit"){

            gettingInput = false;

        }else{

            cout << "Command provided was not one that is listed" << endl;

        }
    }

    return 0;

}
