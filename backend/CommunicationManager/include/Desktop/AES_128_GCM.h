/*

TODO:
-SOLIDIFY TYPE RETURNS NOT ALL INTEGERS AND MAKE THEM UNSIGNED
-FOR MORE COMPLEX FUNCTIONS IN AES MAYBE LET THEM CHANGE IN PLACE INSTEAD OF RETURNING NEW THING OVER AND OVER TO REPASTE OVER THE OLD ONE
-Finish up deconstructor

*/

#ifndef AES_128_GCM_H
#define AES_128_GCM_H

#include <iostream>
#include <vector>
#include <array>
#include <string>

class AES_128_GCM{

    public:

        AES_128_GCM();
        ~AES_128_GCM();

        void AES_128_GCM_Encrypt(const uint8_t key[16], const uint8_t nonce[12], const uint8_t Sbox[256], const uint8_t Inv_Sbox[256]);
        void AES_128_GCM_Decrypt();

        static uint8_t gfMulInverse(uint8_t x);
        static uint8_t gfDivide(uint8_t l, uint8_t r);
        static uint8_t gfPower(uint8_t b, int p);
        static uint8_t gfMul(uint8_t l, uint8_t r);
        static uint8_t gfAdd(uint8_t l, uint8_t r);

    private:

        uint8_t Rcon[11] = {0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1B, 0x36};

        std::vector<uint32_t> expandedKey;

//GCM
//-------------------------------------------------------------------------------------------------------------

        void encryptBlock(const uint8_t in[16], uint8_t out[16], const uint32_t roundKeys[44], const uint8_t Sbox[256]);
        void generateHashSubkey(const uint32_t roundKeys[44], uint8_t H[16], const uint8_t Sbox[256]);
        void ctrEncrypt(const uint8_t plaintext[16], uint8_t ciphertext[16], uint8_t counter[16], const uint32_t roundKeys[44], const uint8_t Sbox[256]);
        void ghash(const uint8_t H[16], const uint8_t* A, size_t A_len, const uint8_t* C, size_t C_len, uint8_t tag[16]);
        void computeTag(const uint8_t J0[16], const uint8_t H[16], const uint8_t* A, size_t A_len, const uint8_t* C, size_t C_len, const uint32_t roundKeys[44], uint8_t tag[16], const uint8_t Sbox[256]);
        void incrementCounter(uint8_t counter[16]);

        void gfMulArr(const uint8_t X[16], const uint8_t H[16], uint8_t out[16]);

//-------------------------------------------------------------------------------------------------------------

//AES
//-------------------------------------------------------------------------------------------------------------

        void addRoundKey(std::vector<std::vector<uint8_t>>& state, const uint32_t roundKeys[44], int round);

        void keyExpansion(const uint8_t key[16], uint32_t roundKeys[44], const uint8_t Rcon[10], const uint8_t Sbox[256], int rounds, int length);

        void subBytes(std::vector<std::vector<uint8_t>>& plaintext, const uint8_t Sbox[256]);
        void shiftRows(std::vector<std::vector<uint8_t>>& plaintext);
        void mixColumns(std::vector<std::vector<uint8_t>>& plaintext);
        void invSubBytes(std::vector<std::vector<uint8_t>>& ciphertext, const uint8_t Inv_Sbox[256]);
        void invShiftRows(std::vector<std::vector<uint8_t>>& ciphertext);
        void invMixColumns(std::vector<std::vector<uint8_t>>& ciphertext);
        uint32_t subWord(const uint8_t Sbox[256], uint32_t word) const;
        uint32_t rotWord(uint32_t word) const;

        std::vector<uint8_t> leftRotate(const std::vector<uint8_t>& row, int n) const;
        std::vector<uint8_t> rightRotate(const std::vector<uint8_t>& row, int n) const;

        int degree(uint8_t x) const;

};

#endif