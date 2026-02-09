/*

TODO:
-SOLIDIFY TYPE RETURNS NOT ALL INTEGERS AND MAKE THEM UNSIGNED
-ADD GCM CAPABILITIES
-FOR MORE COMPLEX FUNCTIONS IN AES MAYBE LET THEM CHANGE IN PLACE INSTEAD OF RETURNING NEW THING OVER AND OVER TO REPASTE OVER THE OLD ONE
-ADD ABILITY TO SWAP INITIAL KEY IV AND AFFLINE TRANSFORM WHEN SETTING UP COMMUNICATION

*/

#ifndef AES_128_CCM_H
#define AES_128_CCM_H

#include <iostream>
#include <vector>
#include <array>
#include <string>

class AES_128_GCM{

    public:

        AES_128_GCM();
        ~AES_128_GCM();

        //TODO make pass by reference and const
        void AES_128_GCM_Encrypt(uint8_t afflineTransformShiftAmount, const std::array<std::array<uint8_t, 4>, 4>& IV, const std::array<uint8_t, 16>& keyInitial, const std::array<uint8_t, 256>& Sbox, const std::array<uint8_t, 256>& Inv_Sbox, const std::array<uint8_t, 10>& Rcon);
        void AES_128_GCM_Decrypt();

        static uint8_t gfMulInverse(uint8_t x);
        static uint8_t gfDivide(uint8_t l, uint8_t r);
        static uint8_t gfPower(uint8_t b, int p);
        static uint8_t gfMul(uint8_t l, uint8_t r);
        static uint8_t gfAdd(uint8_t l, uint8_t r);

    private:

        //TODO get ride of all this and add it by passing into constructor from Security manager
        uint8_t afflineTransformShiftAmount = 69;
        uint8_t IV[4][4] = {
            {0x32, 0x88, 0x31, 0xE0},
            {0x43, 0x5A, 0x31, 0x37},
            {0xF6, 0x30, 0x98, 0x07},
            {0xA8, 0x8D, 0xA2, 0x34}
        };
        uint8_t keyInitial[16] = {
            0x00, 0x01, 0x02, 0x03,
            0x10, 0x11, 0x12, 0x13,
            0x20, 0x21, 0x22, 0x23,
            0x30, 0x31, 0x32, 0x33
        };
        uint8_t Sbox[256];
        uint8_t Inv_Sbox[256];
        uint8_t Rcon[10] = {0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1B, 0x36};

        std::vector<uint32_t> expandedKey;

//GCM
//-------------------------------------------------------------------------------------------------------------

        void encryptBlock(const uint8_t in[16], uint8_t out[16], const uint32_t roundKeys[44]);
        void generateHashSubkey(const uint32_t roundKeys[44], uint8_t H[16]);
        void ctrEncrypt(const uint8_t plaintext[16], uint8_t ciphertext[16], uint8_t counter[16], const uint32_t roundKeys[44]);
        void ghash(const uint8_t H[16], const uint8_t* A, size_t A_len, const uint8_t* C, size_t C_len, uint8_t tag[16]);
        void computeTag(const uint8_t J0[16], const uint8_t H[16], const uint8_t* A, size_t A_len, const uint8_t* C, size_t C_len, const uint32_t roundKeys[44], uint8_t tag[16]);
        void incrementCounter(uint8_t counter[16]);

//-------------------------------------------------------------------------------------------------------------

//AES
//-------------------------------------------------------------------------------------------------------------

        void SboxGenerator();

        void addRoundKey(std::vector<std::vector<uint8_t>>& state, const const uint32_t roundKeys[44], int round);

        void keyExpansion(const uint8_t key[16], uint32_t roundKeys[44], int rounds, int length);

        void subBytes(std::vector<std::vector<uint8_t>>& plaintext);
        void shiftRows(std::vector<std::vector<uint8_t>>& plaintext);
        void mixColumns(std::vector<std::vector<uint8_t>>& plaintext);
        void invSubBytes(std::vector<std::vector<uint8_t>>& ciphertext);
        void invShiftRows(std::vector<std::vector<uint8_t>>& ciphertext);
        void invMixColumns(std::vector<std::vector<uint8_t>>& ciphertext);
        uint32_t subWord(uint32_t word) const;
        uint32_t rotWord(uint32_t word) const;

        std::vector<uint8_t> leftRotate(const std::vector<uint8_t>& row, int n) const;
        std::vector<uint8_t> rightRotate(const std::vector<uint8_t>& row, int n) const;

        int degree(uint8_t x) const;

};

#endif