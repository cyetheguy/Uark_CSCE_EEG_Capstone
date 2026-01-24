/*

TODO:
-GET RID OF GF HELPER FUNCTIONS AND JUST USE A AES CLASS OBJECT FOR THEM
-Some point move all the AES stuff into AES and make it only a member of that class so other classes don't know what is being used for encryption they don't need to know it
 all they know is what goes in and what comes out and a key stuff like the expanded key should be private or rcon/subbox can be public in AES class don't need to be here

*/

#ifndef SECURITY_H
#define SECURITY_H

#include <iostream>
#include <vector>
#include <string>

#include "AES_128_CCM.h"
#include "ECDHE.h"

class SecurityManager{

    public:

        SecurityManager();
        ~SecurityManager();

        void AES_128_CCM_Encrypt();
        void AES_128_CCM_Decrypt();

        std::string operator<<(const SecurityManager& SM);

    private:

        int afflineTransformShiftAmount = 69;
        int IV[4][4] = {
            {0x32, 0x88, 0x31, 0xE0},
            {0x43, 0x5A, 0x31, 0x37},
            {0xF6, 0x30, 0x98, 0x07},
            {0xA8, 0x8D, 0xA2, 0x34}
        };
        int keyInitial[16] = {
            0x00, 0x01, 0x02, 0x03,
            0x10, 0x11, 0x12, 0x13,
            0x20, 0x21, 0x22, 0x23,
            0x30, 0x31, 0x32, 0x33
        };
        int Sbox[256];
        int Inv_Sbox[256];
        int Rcon[10] = {0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1B, 0x36};
        std::vector<int> expandedKey;

        void SboxGenerator();

        int gfMulInverse(int x) const;
        int gfPower(int b, int p) const;
        int gfMul(int l, int r) const;
        
        BigInt<4> n;
        BigInt<4> r;

};

#endif