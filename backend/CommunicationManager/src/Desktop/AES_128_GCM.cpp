/*

TODO:
-Adapt some of the vectors to arrays and other parameters to pointers
-Figure out what should be shown where with class composition and relation between header and cpp file

*/

#include "AES_128_GCM.h"

using namespace std;

//-------------------------------------------------------------------------------------------------------------
//Public

AES_128_GCM::AES_128_GCM(){
    cout << "Creating AES_128_GCM [NEEDS TO BE IMPLEMENTED]" << endl;
};

AES_128_GCM::~AES_128_GCM(){
    cout << "Deconstructing AES_128_GCM manager [NEEDS TO BE IMPLEMENTED]" << endl;
};

void AES_128_GCM::AES_128_GCM_Encrypt(const uint8_t key[16], const uint8_t nonce[12], const uint8_t Sbox[256], const uint8_t Inv_Sbox[256]){
    cout << "Encrypt function called [NEEDS TO BE IMPLEMENTED]" << endl;
};

void AES_128_GCM::AES_128_GCM_Decrypt(){
    cout << "Decrypt function called [NEEDS TO BE IMPLEMENTED]" << endl;
};

//Private
//-------------------------------------------------------------------------------------------------------------

//GCM Functions
//-------------------------------------------------------------------------------------------------------------

//Normal AES_128 encrypt
void AES_128_GCM::encryptBlock(const uint8_t in[16], uint8_t out[16], const uint32_t roundKeys[44], const uint8_t Sbox[256]){
    vector<vector<uint8_t>> state(4, vector<uint8_t>(4));

    for(int c = 0; c < 4; c++){
        for(int r = 0; r < 4; r++){
            state[r][c] = in[c * 4 + r];
        }
    }

    addRoundKey(state, roundKeys, 0);

    for(int round = 1; round < 10; round++){
        subBytes(state, Sbox);
        shiftRows(state);
        mixColumns(state);
        addRoundKey(state, roundKeys, round);
    }

    subBytes(state, Sbox);
    shiftRows(state);
    addRoundKey(state, roundKeys, 10);

    for(int c = 0; c < 4; c++){
        for(int r = 0; r < 4; r++){
            out[c * 4 + r] = state[r][c];
        }
    }
}

void AES_128_GCM::generateHashSubkey(const uint32_t roundKeys[44], uint8_t H[16], const uint8_t Sbox[256]){
    uint8_t zeroBlock[16] = {0};

    encryptBlock(zeroBlock, H, roundKeys, Sbox);

    for(int i = 0; i < 16; i++){
        H[i] = zeroBlock[i];
    }
}

void AES_128_GCM::ctrEncrypt(const uint8_t plaintext[16], uint8_t ciphertext[16], uint8_t counter[16], const uint32_t roundKeys[44], const uint8_t Sbox[256]){
    uint8_t keystream[16];

    encryptBlock(counter, keystream, roundKeys, Sbox);

    for(int i = 0; i < 16; i++){
        ciphertext[i] = plaintext[i] ^ keystream[i];
    }

    incrementCounter(counter);
}

void AES_128_GCM::ghash(const uint8_t H[16], const uint8_t* A, size_t A_len, const uint8_t* C, size_t C_len, uint8_t tag[16]){
    uint8_t X[16] = {0};
    uint8_t block[16];

    for(size_t offset = 0; offset < A_len; offset += 16){
        size_t blockSize = min((size_t)16, A_len - offset);
        memset(block, 0, 16);
        memcpy(block, A + offset, blockSize);
        for(int i = 0; i < 16; i++){
            gfMulArr(X, H, X);
        }
    }

    for(size_t offset = 0; offset < C_len; offset += 16){
        size_t blockSize = min((size_t)16, C_len - offset);
        memset(block, 0, 16);
        memcpy(block, C + offset, blockSize);
        for(int i = 0; i < 16; i++){
            X[i] ^= block[i];
        }
        gfMulArr(X, H, X);
    }

    memset(block, 0, 16);
    uint64_t A_bits = A_len * 8;
    uint64_t C_bits = C_len * 8;
    for(int i = 0; i < 8; i++){
        block[i] = (A_bits >> (56 - i*8)) & 0xFF;
        block[i+8] = (C_bits >> (56 - i*8)) & 0xFF;
    }

    for(int i = 0; i < 16; i++){
        X[i] ^= block[i];
    }
    memcpy(tag, X, 16);
}

void AES_128_GCM::computeTag(const uint8_t J0[16], const uint8_t H[16], const uint8_t* A, size_t A_len, const uint8_t* C, size_t C_len, const uint32_t roundKeys[44], uint8_t tag[16], const uint8_t Sbox[256]){
    uint8_t ghashVal[16];
    ghash(H, A, A_len, C, C_len, ghashVal);

    uint8_t s[16];
    encryptBlock(J0, s, roundKeys, Sbox);

    for(int i = 0; i < 16; i++){
        tag[i] = ghashVal[i] ^ s[i];
    }

}

void AES_128_GCM::incrementCounter(uint8_t counter[16]){
    for(int i = 15; i >= 12; i--){
        if(counter[i]++ != 0){
            break;
        }
    }
}

//GCM Helper functions
//-----------------------------------------------------------------------------------------------------------------

void AES_128_GCM::gfMulArr(const uint8_t X[16], const uint8_t H[16], uint8_t out[16]){
    uint8_t Z[16] = {0};
    uint8_t V[16];

    memcpy(V, H, 16);

    for(int i = 0; i < 128; i++){
        int bit = (X[i/8] >> (7 - (i % 8))) & 1;
        if(bit){
            for(int j = 0; j < 16; j++){
                Z[j] ^= V[j];
            }
        }

        bool lsb = V[15] & 1;
        for(int j = 15; j > 0; j--){
            V[j] = (V[j] >> 1) | ((V[j - 1] & 1) << 7);
        }
        V[0] >>= 1;
        if(lsb){
            V[0] ^= 0xE1;
        }
    }
    memcpy(out, Z, 16);
}

//Key functions
//-----------------------------------------------------------------------------------------------------------------

void AES_128_GCM::addRoundKey(vector<vector<uint8_t>>& state, const uint32_t roundKeys[44], int round){
    for(int i = 0; i < 4; i++){
        uint32_t word = roundKeys[round * 4 + i];
        state[0][i] ^= ((word >> 24) & 0xFF);
        state[1][i] ^= ((word >> 16) & 0xFF);
        state[2][i] ^= ((word >> 8) & 0xFF);
        state[3][i] ^= (word & 0xFF);
    }
};

void AES_128_GCM::keyExpansion(const uint8_t key[16], uint32_t roundKeys[44], const uint8_t Rcon[10], const uint8_t Sbox[256], int rounds, int length){

    int Nk = length/32;        //num words in key
    int Nr = rounds;            //num rounds
    int Nb = 4;                 //block size

    int totalWords = Nb * (Nr + 1);

    for(int i = 0; i < Nk; i++){
        roundKeys[i] = ((uint32_t) key[4*i] << 24) |
                           ((uint32_t) key[4*i + 1] << 16) |
                           ((uint32_t) key[4*i + 2] << 8) |
                           ((uint32_t) key[4*i + 3]);
    }
    
    for(int i = Nk; i < totalWords; i++){
        uint32_t temp = roundKeys[i-1];

        if(i % Nk == 0){
            temp = subWord(Sbox, rotWord(temp)) ^ (static_cast<uint32_t>(Rcon[i/Nk - 1]) << 24);
        }else if(Nk > 6 && i % Nk == 4){
            temp = subWord(Sbox, temp);
        }

        roundKeys[i] = roundKeys[i - Nk] ^ temp;

    }

};

//Text manipulation functions
//-----------------------------------------------------------------------------------------------------------------

void AES_128_GCM::subBytes(vector<vector<uint8_t>>& plaintext, const uint8_t Sbox[256]){

    for(int row = 0; row < plaintext.size(); row++){
        for(int col = 0; col < plaintext[row].size(); col++){
            plaintext[row][col] = Sbox[plaintext[row][col]];
        }
    }

};

void AES_128_GCM::shiftRows(vector<vector<uint8_t>>& plaintext){
    for(int row = 0; row < plaintext.size(); row++){
        plaintext[row] = leftRotate(plaintext[row], row);
    }
};

void AES_128_GCM::mixColumns(vector<vector<uint8_t>>& plaintext){
    for(int c = 0; c < plaintext[0].size(); c++){
        vector<uint8_t> column(4);
        for(int r = 0; r < plaintext.size(); r++){
            column[r] = plaintext[r][c] & 0xFF;
        }

        uint8_t temp[4];

        temp[0] = gfMul(2, column[0]) ^ gfMul(3, column[1]) ^ column[2] ^ column[3];
        temp[1] = column[0] ^ gfMul(2, column[1]) ^ gfMul(3, column[2]) ^ column[3];
        temp[2] = column[0] ^ column[1] ^ gfMul(2, column[2]) ^ gfMul(3, column[3]);
        temp[3] = gfMul(3, column[0]) ^ column[1] ^ column[2] ^ gfMul(2, column[3]);

        for(int i = 0; i < column.size(); i++){
            column[i] = temp[i];
        }

        for(int r = 0; r < 4; r++){
            plaintext[r][c] = column[r];
        }

    }
};

void AES_128_GCM::invSubBytes(vector<vector<uint8_t>>& ciphertext, const uint8_t Inv_Sbox[256]){

    for(int row = 0; row < 4; row++){
        for(int col = 0; col < 4; col++){
            ciphertext[row][col] = Inv_Sbox[ciphertext[row][col] & 0xFF];
        }
    }

};

void AES_128_GCM::invShiftRows(vector<vector<uint8_t>>& ciphertext){
    for(int row = 0; row < 4; row++){
        ciphertext[row] = rightRotate(ciphertext[row], row);
    }
};

void AES_128_GCM::invMixColumns(vector<vector<uint8_t>>& ciphertext){

    for (int c = 0; c < 4; c++) {
        vector<uint8_t> column(4);
        for (int r = 0; r < ciphertext.size(); r++) {
            column[r] = ciphertext[r][c] & 0xFF;
        }

        uint8_t temp[4];
        temp[0] = gfMul(0x0E, column[0]) ^ gfMul(0x0B, column[1]) ^ gfMul(0x0D, column[2]) ^ gfMul(0x09, column[3]);
        temp[1] = gfMul(0x09, column[0]) ^ gfMul(0x0E, column[1]) ^ gfMul(0x0B, column[2]) ^ gfMul(0x0D, column[3]);
        temp[2] = gfMul(0x0D, column[0]) ^ gfMul(0x09, column[1]) ^ gfMul(0x0E, column[2]) ^ gfMul(0x0B, column[3]);
        temp[3] = gfMul(0x0B, column[0]) ^ gfMul(0x0D, column[1]) ^ gfMul(0x09, column[2]) ^ gfMul(0x0E, column[3]);

        for(int i = 0; i < 4; i++){
            column[i] = temp[i];
        }

        for (int r = 0; r < 4; r++) {
            ciphertext[r][c] = column[r];
        }
    }

};

vector<uint8_t> AES_128_GCM::leftRotate(const vector<uint8_t>& row, int n) const{
    int len = row.size();
    vector<uint8_t> rotated(len);
    for(int i = 0; i < len; i++){
        rotated[i] = row[(i + n) % len];
    }
    return rotated;
};

vector<uint8_t> AES_128_GCM::rightRotate(const vector<uint8_t>& row, int n) const{
    int len = row.size();
    vector<uint8_t> rotated(len);
    for(int i = 0; i < len; i++){
        rotated[i] = row[(i - n + len) % len];
    }
    return rotated;
};

//Word manipulation
//-----------------------------------------------------------------------------------------------------------------

uint32_t AES_128_GCM::subWord(const uint8_t Sbox[256], uint32_t word) const{
    uint8_t b0 = Sbox[(word >> 24) & 0xFF];
    uint8_t b1 = Sbox[(word >> 16) & 0xFF];
    uint8_t b2 = Sbox[(word >> 8) & 0xFF];
    uint8_t b3 = Sbox[word & 0xFF];
    return ((uint32_t) b0 << 24) | ((uint32_t) b1 << 16) | ((uint32_t) b2 << 8) | (uint32_t) b3;
};

uint32_t AES_128_GCM::rotWord(uint32_t word) const{
    return (word << 8) | (word >> 24);
};

//GF math functions
//-----------------------------------------------------------------------------------------------------------------

uint8_t AES_128_GCM::gfMulInverse(uint8_t x){
    if(x == 0){
        return 0; //0's inverse is 0
    }
    x = gfPower(x, 254);
    return x;
};

uint8_t AES_128_GCM::gfDivide(uint8_t l, uint8_t r){
    return gfMul(l, gfPower(r, 254));
};

uint8_t AES_128_GCM::gfPower(uint8_t b, int p){
    uint8_t result = 1;
    while(p > 0){   //keep cycling up through bit positions until no more
        if((p & 1) != 0){   //If position is not 0 add mulitplication to result
            result = gfMul(result, b);
        }
        b = gfMul(b, b);
        p >>= 1;    //cycle to next position
    }
    return result;
};

uint8_t AES_128_GCM::gfMul(uint8_t l, uint8_t r){
    uint8_t product = 0;

    for(int i = 0; i < 8; i++){

        if(r & 1){
            product ^= l;
        }
        bool hasOverflown = (l & 0x80) != 0;
        l <<= 1;
        if(hasOverflown){
            l ^= 0x1B;
        }
        r >>= 1;
    }
    return product;
};

uint8_t AES_128_GCM::gfAdd(uint8_t l, uint8_t r){
    uint8_t sum = l ^ r;
    return sum;
};

//AES helper functions
//-----------------------------------------------------------------------------------------------------------------

int AES_128_GCM::degree(uint8_t x) const{
    if(x == 0){
        return -1;
    }
    int deg = 0;
    while(x >>= 1){
        deg++;
    }
    return deg;
};