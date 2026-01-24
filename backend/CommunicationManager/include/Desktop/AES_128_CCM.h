/*

TODO:
-SOLIDIFY TYPE RETURNS NOT ALL INTEGERS AND MAKE THEM UNSIGNED
-ADD CCM CAPABILITIES
-FOR MORE COMPLEX FUNCTIONS IN AES MAYBE LET THEM CHANGE IN PLACE INSTEAD OF RETURNING NEW THING OVER AND OVER TO REPASTE OVER THE OLD ONE
-ADD ABILITY TO SWAP INITIAL KEY IV AND AFFLINE TRANSFORM WHEN SETTING UP COMMUNICATION

*/

#ifndef AES_128_CCM_H
#define AES_128_CCM_H

#include <iostream>
#include <vector>
#include <string>

class AES_128_CCM{

    public:

        AES_128_CCM();
        ~AES_128_CCM();

        //TODO make pass by reference and const
        void AES_128_CCM_Encrypt(int afflineTransformShiftAmount, int IV[4][4], int keyInitial[16], int Sbox[256], int Inv_Sbox[256], int Rcon[10]);
        void AES_128_CCM_Decrypt();

        static int gfMulInverse(int x);
        static int gfDivide(int l, int r);
        static int gfPower(int b, int p);
        static int gfMul(int l, int r);
        static int gfAdd(int l, int r);

        std::string operator<<(const AES_128_CCM& AES);

    private:

        //TODO get ride of all this and add it by passing into constructor from Security manager
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

        void subBytes(std::vector<std::vector<int>>& plaintext);
        void shiftRows(std::vector<std::vector<int>>& plaintext);
        void mixColumns(std::vector<std::vector<int>>& plaintext);
        void invSubBytes(std::vector<std::vector<int>>& ciphertext);
        void invShiftRows(std::vector<std::vector<int>>& ciphertext);
        void invMixColumns(std::vector<std::vector<int>>& ciphertext);

        void addRoundKey(std::vector<std::vector<int>>& state, const std::vector<int>& roundKeys, int round);

        std::vector<int> keyExpansion(std::vector<int>& key, int rounds, int length);

        int subWord(int word) const;
        int rotWord(int word) const;

        std::vector<int> leftRotate(const std::vector<int>& row, int n) const;
        std::vector<int> rightRotate(const std::vector<int>& row, int n) const;

        int degree(int x) const;

};

#endif