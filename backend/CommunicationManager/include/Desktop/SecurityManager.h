/*

TODO:
-GET RID OF GF HELPER FUNCTIONS AND JUST USE A AES CLASS OBJECT FOR THEM
-Some point move all the AES stuff into AES and make it only a member of that class so other classes don't know what is being used for encryption they don't need to know it
 all they know is what goes in and what comes out and a key stuff like the expanded key should be private or rcon/subbox can be public in AES class don't need to be here
-Somethings in here may need to be set to contexpr and done at compile time find them and fix them

*/

#ifndef SECURITY_H
#define SECURITY_H

#include <iostream>
#include <vector>
#include <string>

#include "BigInt.h"

class AES_128_GCM;
struct ECCurve;
struct ECPoint;
struct PublicKey;
struct Signature;

class SecurityManager{

    public:

        SecurityManager();
        ~SecurityManager();

//ECC
//-------------------------------------------------------------------------------------------------------------

        void generateKeyPair();
        void signMessage(const std::vector<uint8_t>& msg);
        bool verifyLastSignature();

        void setCurveParameters(const BigInt<4>& p, const BigInt<4>& a, const BigInt<4>& b, const BigInt<4>& n, const BigInt<4>& h, const ECPoint& G);

//AES
//-------------------------------------------------------------------------------------------------------------

        void encryptBuffer(const std::vector<uint8_t>& in, std::vector<uint8_t>& out);
        void decryptBuffer(const std::vector<uint8_t>& in, std::vector<uint8_t>& out);

        void setAESAffline(uint8_t afflineTransformShiftAmount);

    private:
        
        AES_128_GCM* aes;
        ECCurve* eccState;

        BigInt<4> privKey;
        PublicKey* pubKey;

        //Rcon established by AES Standard
        uint8_t Sbox[256];
        uint8_t Inv_Sbox[256];
        uint8_t afflineTransformShiftAmount;

};

#endif