#include "SecurityManager.h"

using namespace std;

//-------------------------------------------------------------------------------------------------------------
//Public

SecurityManager::SecurityManager() : n(4), r(BigInt<4>::make_R())
{
    cout << "Creating security manager [NEEDS TO BE IMPLEMENTED]" << endl;

};

SecurityManager::~SecurityManager(){
    cout << "Deconstructing security manager [NEEDS TO BE IMPLEMENTED]" << endl;
};

string SecurityManager::operator<<(const SecurityManager& SM){
    cout << "Called security manager to string [NEEDS TO BE IMPLEMENTED]" << endl;
    return "";
};

void SecurityManager::AES_128_CCM_Encrypt(){
    cout << "Encrypt function called [NEEDS TO BE IMPLEMENTED]" << endl;
};

void SecurityManager::AES_128_CCM_Decrypt(){
    cout << "Decrypt function called [NEEDS TO BE IMPLEMENTED]" << endl;
};

//-------------------------------------------------------------------------------------------------------------
//Private

void SecurityManager::SboxGenerator(){
    for(int i = 0; i < 256; i++){
        int inv = (i == 0) ? 0 : AES_128_CCM::gfMulInverse(i);
        int sub = 0;
        for(int j = 0; j < 8; j++){
            int bit = ((inv >> j) & 1) ^
                ((inv >> (j + 1) % 8) & 1) ^ 
                ((inv >> (j + 2) % 8) & 1) ^ 
                ((inv >> (j + 3) % 8) & 1) ^ 
                ((inv >> (j + 4) % 8) & 1) ^
                ((afflineTransformShiftAmount >> j) & 1);
            sub |= (bit << j);
        }
    }

    for(int i = 0; i < 256; i++){
        int j = Sbox[i];
        Inv_Sbox[j] = i;
    }
}
