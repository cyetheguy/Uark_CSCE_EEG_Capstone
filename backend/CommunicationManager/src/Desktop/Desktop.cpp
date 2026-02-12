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
-separate main tests (use multi line comments to get rid of whats not being tested)
-comb through a bunch of stuff and fix syntaxing
-Go through and find what needs to be contexpr in other classes
-Add MTU size negotiation for 64 bytes probably
-Reform BigInt class to be C compatible and also not need to be included where it's used

*/

//-------------------------------------------------------------------------------------------------------------

#include "ConnectionManager.h"
#include "SecurityManager.h"

using std::cout;
using std::endl;
using std::cin;
using std::hex;
using std::string;

int main(){    

    cout << "Hello World" << endl;

//BigInt Testing
//-------------------------------------------------------------------------------------------------------------

    BigInt<4> zero = 0;
    BigInt<4> one = 1;
    BigInt<4> eleven = 11;
    BigInt<4> sixteen = 16;
    BigInt<4> bignumber = string("3F8A9D4B2E6C1F07B45D9E3A6F8C2B1D9A0E4F6C7B8D2A1F3C5E7B9D0A6F4C2");
    BigInt<4> max = string("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
    BigInt<4> elevenCopy = eleven;
    BigInt<4> sixteenF = string("FFFFFFFFFFFFFFFF");
    BigInt<4> sixty_five_and_one = string("10000000000000000");

    BigInt<4> MontEleven;
    BigInt<4> MontSixteenF;

    BigInt<4> n = string("1B69B4BACD05F7B1E5F7");
    BigInt<4> R2 = BigInt<4>::make_R2(n);
    BigInt<4> Nprime = BigInt<4>::compute_Nprime(n);
    BigInt<4> R_inverse = BigInt<4>::compute_RInverse(n);


    BigInt<4> res;

//Testing to string
/*
    cout << "Testing to string for BigInt on BigInt zero: " << zero << endl;
    cout << "Testing to string for BigInt on BigInt one: " << one << endl;
    cout << "Testing to string for BigInt on BigInt eleven: " << eleven << endl;
    cout << "Testing to string for BigInt on BigInt eleven copy: " << eleven << endl;
    cout << "Testing to string for BigInt on BigInt bignumber: " << bignumber << endl;
    cout << "Testing to string for BigInt on BigInt 128 bit prime: " << n << endl;
    cout << "Testing to string for BigInt on max: " << max << endl;
*/

//Testing encode and decode operators

    MontEleven = BigInt<4>::mont_encode(eleven, n, Nprime, R2);

    cout << "Mont encode of 11: " << MontEleven << endl;

    MontSixteenF = BigInt<4>::mont_encode(sixteenF, n, Nprime, R2);

    cout << "Mont encode of sixteenF: " << MontSixteenF << endl;

    BigInt<4> decode = BigInt<4>::mont_decode(MontEleven, n, Nprime, R_inverse);

    cout << "Testing decode with MontEleven: " << decode << endl;

//Testing non overflow [SUB ADD WORKS]

    BigInt<4>::add_mod(res, eleven, elevenCopy, n);

    cout << "Output of add_mod: " << res << endl;

    BigInt<4>::sub_mod(res, eleven, elevenCopy, n);

    cout << "Output of sub_mod: " << res << endl;

    cout << "Output of mul_mod: " << endl;

    cout << "Output of div_mod: " << endl;

    cout << "Testing mod_exp: " << endl;

    cout << "Testing mod_inv: " << endl;

    cout << "Testing square mod: " << endl;

//TODO TEST MULT
//Testing overflow [ADD AND SUB WORK]
/*
    BigInt<4>::add_mod(res, sixteenF, one, n);

    cout << "Testing single overflow add_mod: " << res << endl;

    BigInt<4>::sub_mod(res, sixty_five_and_one, one, n);

    cout << "Testing single overflow sub_mod: " << res << endl;

    BigInt<4>::add_mod(res, max, one, n);

    cout << "Testing max overflow add_mod: " << res << endl;

    BigInt<4>::sub_mod(res, zero, one, n);

    cout << "Testing max overflow sub_mod: " << res << endl;

    cout << "Testing single overflow mul_mod: " << endl;

    cout << "Testing max overflow mul_mod: " << endl;

    cout << "Testing single overflow div_mod: " << endl;

    cout << "Testing max overflow div_mod: " << endl;

    cout << "Testing single overflow mod_exp: " << endl;

    cout << "Testing max overflow mod_exp: " << endl;

    cout << "Testing multi-limb mod_inv: " << endl;
    
    cout << "Testing single overflow square_mod: " << endl;

    cout << "Testing max overflow square_mod: " << endl;
*/

//Testing shift operators [WORKS]
/*
    BigInt<4>::leftShift(res, one, 3);

    cout << "Testing left shift of 1 by 3 bits: " << res << endl;

    BigInt<4>::rightShift(res, sixteen, 3);

    cout << "Testing right shift of 16 by 3 bits: " << res << endl;

    BigInt<4>::leftShift(res, sixteenF, 1);

    cout << "Testing left shift up into new limb: " << res << endl;

    BigInt<4>::rightShift(res, sixty_five_and_one, 1);

    cout << "Testing right shift down into new limb: " << res << endl;

    BigInt<4>::leftShift(res, one, 512);

    cout << "Testing max left shift: " << res << endl;

    BigInt<4>::rightShift(res, one, 512);

    cout << "Testing max right shift: " << res << endl;
*/

//Testing even odd logic detection [WORKS]
/*
    cout << "Is one even: " << hex << one.isEven() << endl;
    cout << "Is one odd: " << hex << one.isOdd() << endl;

    cout << "Is eleven even: " << hex << eleven.isEven() << endl;
    cout << "Is eleven odd: " << hex << eleven.isOdd() << endl;

    cout << "Is zero even: " << hex << zero.isEven() << endl;
    cout << "Is zero odd: " << hex << zero.isOdd() << endl;

    cout << "Testing compare on one and zero" << endl;

    cout << "Testing compare on reverse of previous" << endl;

    cout << "Testing compare on big number and max" << endl;

    cout << "Testing compare on reverse of previous" << endl;

*/

//Testing variable compute methods

    cout << "Testing make R^2: " << R2 << endl;

    cout << "Testing compute_Nprime: " << Nprime << endl;

    cout << "Testing compute R_inverse: " << R_inverse << endl;


//BLE Testing
//-------------------------------------------------------------------------------------------------------------

/*

    ConnectionManager CM;
    SecurityManager SM;

    bool gettingInput = true;
    string userInput;
    string message;

    cout << "Please provide one of the following commands:" <<
            "\nScan [For discovering devices]" <<
            "\nStop [To stop discovering devices]" <<
            "\nConnectaddress(DeviceAddress) [Connect to a device with bluetooth address]" <<
            "\nConnectUUID(UUID) [Connect to a device with a UUID]" <<
            "\nQuit [Quits the program]" <<
            "\nHelp [Relists all these commands]" << 
            "\n[NOTE: program automatically will connect with scanned devices that match a certain connection critera bypassing need to even use connect(param)" << endl;

    while(gettingInput){

        cin >> userInput;

        transform(userInput.begin(), userInput.end(), userInput.begin(), ::tolower);

        if(userInput == "connectaddress"){

            cout << "Please provide address of device" << endl;

            cin >> userInput;

        }else if(userInput == "connectuuid"){

            cout << "Please provide UUID of device" << endl;

            cin >> userInput;

        }else if(userInput == "scan"){

            CM.scan();

        }else if(userInput == "stop"){

            CM.stop();

        }else if(userInput == "send"){

            cout << "Please provide the Bluetooth address of device you want to send a message to" << endl;

            cin >> userInput;

            uint64_t addr = CM.stringToBluetoothAddress(userInput);

            if(!addr){
                cout << "Address provided was incorrect try using send again" << endl;
            }else{

                cout << "Please provide the message you'd like to send" << endl;
                cin >> message;
                CM.sendPlainMessage(addr, message);

            }

        }else if(userInput == "help"){
            
            cout << "Please provide one of the following commands:" <<
                    "\nScan [For discovering devices]" <<
                    "\nStop [To stop discovering devices]" <<
                    "\nConnect [To connect to a device]" <<
                    "\nQuit [Quits the program]" <<
                    "\nHelp [Relists all these commands]" << endl;

        }else if(userInput == "quit"){

            gettingInput = false;

        }else{

            cout << "Command provided was not one that is listed" << endl;

        }
    }

    */

    cout << "Got to end of program" << endl;

    return 0;

}