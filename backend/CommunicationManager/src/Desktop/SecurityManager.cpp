/*

TODO:
-Remove the prints when all of this is done

*/

#include "SecurityManager.h"

#include "ECC.h"
#include "AES_128_GCM.h"

using namespace std;

//-------------------------------------------------------------------------------------------------------------
//Public

SecurityManager::SecurityManager(){
    
    aes = new AES_128_GCM();
    eccState = new ECCurve();

    eccState->a.zero();
    eccState->b.zero();
    eccState->n.zero();
    eccState->h.zero();
    eccState->G = ECPoint(BigInt<4>(), BigInt<4>(), true);

};

SecurityManager::~SecurityManager(){
    delete aes;
    delete eccState;
};

//ECC
//-------------------------------------------------------------------------------------------------------------

void SecurityManager::generateKeyPair(){
    cout << "Generating ECC key pair..." << endl;

    ECC::randomScalar(eccState->n, privKey);
    pubKey->Q = ECC::scalarMult(eccState->G, privKey, *eccState);

    cout << "Private key generated: " << privKey << endl;
    cout << "Public key generated at point: (" << pubKey->Q.x << ", " << pubKey->Q.y << ")" << endl;

};

void signMessage(const vector<uint8_t>& msg){
    cout << "Signing message of size: " << msg.size() << endl;
};

bool verifyLastSignature(){

    return true;
};

void SecurityManager::setCurveParameters(const BigInt<4>& p, const BigInt<4>& a, const BigInt<4>& b, const BigInt<4>& n, const BigInt<4>& h, const ECPoint& G){
    //Make sure curve is initialized to avoid null pointer errors
    if(!eccState){
        eccState = new ECCurve();
    }

    eccState->p = p;
    eccState->a = a;
    eccState->b = b;
    eccState->n = n;
    eccState->h = h;
    eccState->G = G;

};

//AES
//-------------------------------------------------------------------------------------------------------------

void SecurityManager::encryptBuffer(const vector<uint8_t>& in, vector<uint8_t>& out){
    cout << "Encrypting buffer of size: " << out.size() << endl;

    out = in;
};

void SecurityManager::decryptBuffer(const vector<uint8_t>& in, vector<uint8_t>& out){
    cout << "Decrypting buffer of size: " << in.size() << endl;

    out = in;
};

void SboxGenerator(uint8_t afflineTransformShiftAmount, uint8_t Sbox[256], uint8_t Inv_Sbox[256]){
    for(int i = 0; i < 256; i++){
        uint8_t inv = (i == 0) ? 0 : AES_128_GCM::gfMulInverse(i);
        uint8_t sub = 0;
        for(int j = 0; j < 8; j++){
            uint8_t bit = ((inv >> j) & 1) ^
                ((inv >> (j + 1) % 8) & 1) ^ 
                ((inv >> (j + 2) % 8) & 1) ^ 
                ((inv >> (j + 3) % 8) & 1) ^ 
                ((inv >> (j + 4) % 8) & 1) ^
                ((afflineTransformShiftAmount >> j) & 1);
            sub |= (bit << j);
        }
        Sbox[i] = sub;
    }

    for(int i = 0; i < 256; i++){
        uint8_t j = Sbox[i];
        Inv_Sbox[j] = i;
    }
};

//TODO: Finish this implementation function
void SecurityManager::setAESAffline(uint8_t afflineTransformShiftAmount){
    this->afflineTransformShiftAmount = afflineTransformShiftAmount;
    SboxGenerator(afflineTransformShiftAmount, Sbox, Inv_Sbox);
};