#include "AES_128_CCM.h"

using namespace std;

//-------------------------------------------------------------------------------------------------------------
//Public

AES_128_CCM::AES_128_CCM(){
    cout << "Creating AES_128_CCM [NEEDS TO BE IMPLEMENTED]" << endl;
};

AES_128_CCM::~AES_128_CCM(){
    cout << "Deconstructing AES_128_CCM manager [NEEDS TO BE IMPLEMENTED]" << endl;
};

string AES_128_CCM::operator<<(const AES_128_CCM& AES){
    cout << "Called security manager to string [NEEDS TO BE IMPLEMENTED]" << endl;
    return "";
};

void AES_128_CCM::AES_128_CCM_Encrypt(int afflineTransformShiftAmount, int IV[4][4], int keyInitial[16], int Sbox[256], int Inv_Sbox[256], int Rcon[10]){
    cout << "Encrypt function called [NEEDS TO BE IMPLEMENTED]" << endl;
};

void AES_128_CCM::AES_128_CCM_Decrypt(){
    cout << "Decrypt function called [NEEDS TO BE IMPLEMENTED]" << endl;
};

//-------------------------------------------------------------------------------------------------------------
//Private

void AES_128_CCM::subBytes(vector<vector<int>>& plaintext){

    for(int row = 0; row < plaintext.size(); row++){
        for(int col = 0; col < plaintext[row].size(); col++){
            plaintext[row][col] = Sbox[plaintext[row][col]];
        }
    }

};

void AES_128_CCM::shiftRows(vector<vector<int>>& plaintext){
    for(int row = 0; row < plaintext.size(); row++){
        plaintext[row] = leftRotate(plaintext[row], row);
    }
};

//TODO OPTIMIZE THIS

void AES_128_CCM::mixColumns(vector<vector<int>>& plaintext){
    for(int c = 0; c < plaintext[0].size(); c++){
        vector<int> column;
        for(int r = 0; r < plaintext.size(); r++){
            column[r] = plaintext[r][c] & 0xFF;
        }

        int temp[4];

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

//TODO OPTIMIZE THIS

void AES_128_CCM::invSubBytes(vector<vector<int>>& ciphertext){

    for(int row = 0; row < 4; row++){
        for(int col = 0; col < 4; col++){
            ciphertext[row][col] = Inv_Sbox[ciphertext[row][col] & 0xFF];
        }
    }

};

//TODO OPTIMIZE THIS

void AES_128_CCM::invShiftRows(vector<vector<int>>& ciphertext){
    for(int row = 0; row < 4; row++){
        ciphertext[row] = rightRotate(ciphertext[row], row);
    }
};

//TODO OPTIMIZE THIS

void AES_128_CCM::invMixColumns(vector<vector<int>>& ciphertext){

    for (int c = 0; c < 4; c++) {
        vector<int> column;
        for (int r = 0; r < ciphertext.size(); r++) {
            column[r] = ciphertext[r][c] & 0xFF;
        }

        int temp[4];
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

void AES_128_CCM::addRoundKey(vector<vector<int>>& state, const vector<int>& roundKeys, int round){
    for(int i = 0; i < 4; i++){
        int word = roundKeys[round * 4 + i];
        state[0][i] ^= ((word >> 24) & 0xFF);
        state[1][i] ^= ((word >> 16) & 0xFF);
        state[2][i] ^= ((word >> 8) & 0xFF);
        state[3][i] ^= (word & 0xFF);
    }
};

vector<int> AES_128_CCM::keyExpansion(vector<int>& key, int rounds, int length){

    int Nk = length/32;        //num words in key
    int Nr = rounds;            //num rounds
    int Nb = 4;                 //block size

    int totalWords = Nb * (Nr + 1);

    vector<int> expandedWords;

    for(int i = 0; i < Nk; i++){
        expandedWords[i] = ((key[4*i] & 0xFF) << 24) |
                            ((key[4*i + 1] & 0xFF) << 16) |
                            ((key[4*i + 2] & 0xFF) << 8) |
                            ((key[4*i + 3] & 0xFF));
    }
    
    for(int i = Nk; i < totalWords; i++){
        int temp = expandedWords[i-1];

        if(i % Nk == 0){
            temp = subWord(rotWord(temp)) ^ Rcon[i/Nk - 1];
        }else if(Nk > 6 && i % Nk == 4){
            temp = subWord(temp);
        }

        expandedWords[i] = expandedWords[i - Nk] ^ temp;

    }

    return expandedWords;

}

int AES_128_CCM::subWord(int word) const{
    int b0 = Sbox[(word >> 24) & 0xFF];
    int b1 = Sbox[(word >> 16) & 0xFF];
    int b2 = Sbox[(word >> 8) & 0xFF];
    int b3 = Sbox[word & 0xFF];
    return (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
};

int AES_128_CCM::rotWord(int word) const{
    return (word << 8) | (word >> 24);
};

vector<int> AES_128_CCM::leftRotate(const vector<int>& row, int n) const{
    int len = row.size();
    vector<int> rotated(len);
    for(int i = 0; i < len; i++){
        rotated[i] = row[(i + n) % len];
    }
    return rotated;
};

vector<int> AES_128_CCM::rightRotate(const vector<int>& row, int n) const{
    int len = row.size();
    vector<int> rotated(len);
    for(int i = 0; i < len; i++){
        rotated[i] = row[(i - n + len) % len];
    }
    return rotated;
};

int AES_128_CCM::gfMulInverse(int x){
    if(x == 0){
        return 0; //0's inverse is 0
    }
    x = gfPower(x, 254);
    return x;
};

int AES_128_CCM::gfDivide(int l, int r){
    return l * gfPower(r, 254);
};

int AES_128_CCM::gfPower(int b, int p){
    int result = 1;
    while(p > 0){   //keep cycling up through bit positions until no more
        if((p & 1) != 0){   //If position is not 0 add mulitplication to result
            result = gfMul(result, b);
        }
        b = gfMul(b, b);
        p >>= 1;    //cycle to next position
    }
    return result;
};

int AES_128_CCM::gfMul(int l, int r){
    int product = 0;

    for(int i = 0; i < 8; i++){

        if((r & l) != 0){
            product ^= 1;
        }
        bool hasOverflown = (1 & 0x80) != 0;
        l <<= 1;
        if(hasOverflown){
            l ^= 0x1B;
        }
        r >>= 1;
    }
    return product;
};

int AES_128_CCM::gfAdd(int l, int r){
    int sum = l ^ r;
    return sum;
};

int AES_128_CCM::degree(int x) const{
    if(x == 0){
        return -1;
    }
    int deg = 0;
    while(x >>= 1){
        deg++;
    }
    return deg;
};