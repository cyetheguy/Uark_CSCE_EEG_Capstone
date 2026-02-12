/*

NOTES:
-IMPORTANT:
 -All are size to be 256 bits with size_t having 4 LIMBS however if 512 bit or larger are needed LIMBS can be modified but it must be
  done for every BigInt instance so as to not cause overflow issues in operations with two differing sizes this is done
  to keep performance fast and not have to deal with the overhead of allocating new space for BigInts of differing size
  for modulus in finite field space (If AES_256 is used instead of 128 and we need to bump it up to 512 just do BigInt<8> everywhere)

-Modular multiplication uses montgomery representation as well as functions that use multiplication (exponentiation, inverse)
-Some functions that look like they should return boolean values instead return a mask which functions the same just avoids
 side channel/timing attacks
-This file is a all in one header template file

BIG TODO:
-Once done convert to C code and test with arduino stuff to get it working with virtual hardware simulation on stuff that
 doesn't need BLE yet
-Replace all ifs with cond_mov at some point to make the class cryptographically safe and avoid timing attacks with constant
 time performance

TODO:
-Double check all these are cryptographically safe from any attacks side channel etc
-May not need non modular arithmetic functions
-May not need the .zero() used as often inside the class itself
-Need to change shift operations to work in constant time
-Maybe add in place shifting logic for left and right shift
-May need to tweak parameters for consistency sake
-Finish up deconstructor

*/

#ifndef BIGINT_H
#define BIGINT_H

#include <string>
#include <vector>
#include <iostream>

using std::ostream;

template <size_t LIMBS>
class BigInt{

    public:
        uint64_t data[LIMBS] = {0};
        bool negative = false;

        BigInt(){
            this->zero();
        };
        BigInt(const std::string& hex){
            this->zero();
            size_t len = hex.size();
            for(size_t i = 0; i < len; i++){
                char c = hex[len - 1 - i];
                uint8_t val = (c >= '0' && c <= '9') ? c - '0'
                            : (c >= 'a' && c <= 'f') ? 10 + c - 'a'
                            : (c >= 'A' && c <= 'F') ? 10 + c - 'A'
                            : 0;
                size_t limb = i / 16;
                size_t shift = (i % 16) * 4;
                if(limb < LIMBS){
                    data[limb] |= (uint64_t(val) << shift);
                }
            }
        };
        BigInt(uint64_t num){
            this->zero();
            data[0] = num;
        };
        BigInt(const BigInt&) = default; //have this reinforced in order to implement deconstructor
        ~BigInt(){};

//Normal operations
//-----------------------------------------------------------------------------------------------------------------

        //If overflows will return a carry uint64_t
        static uint64_t add(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& b){
            uint64_t carry = 0;

            //Normal add
            for(size_t i = 0; i < LIMBS; i++){
                uint64_t sum = a.data[i] + b.data[i] + carry;
                carry = (sum < a.data[i] || (carry && sum == a.data[i]) ? 1 : 0);
                res.data[i] = sum;
            }

            return carry;

        };

        //res can only be assigned to a and the function still be safe res != b or res != n will fail ex sub_mod(x, x, y, y) vs bad: sub(x, y,->x, y)
        static void sub(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& b){
            uint64_t borrow = 0;

            //Normal subtract
            for(size_t i = 0; i < LIMBS; i++){
                uint64_t temp = a.data[i] - b.data[i] - borrow;
                borrow = (a.data[i] < b.data[i] + borrow) ? 1 : 0;
                res.data[i] = temp;
            }

        };

        //Will write a quotient and remainder does not do floating point
        static void divide(const BigInt<LIMBS>& a, const BigInt<LIMBS>& b, BigInt<LIMBS>& q, BigInt<LIMBS>& r){

            q.zero();
            r.zero();

            for (int i = 63 * LIMBS - 1; i >= 0; --i){ // iterate over all bits
                leftShift(r, r, 1);                  // multiply r by 2
                r.setBit(0, a.getBit(i));      // add current bit of a

                if (isGreaterThan(r, b) | equals(r, b)){
                    sub(r, r, b);
                    q.setBit(i, 1);
                }
            }
        };

        static void mul(const BigInt<LIMBS>& a, const BigInt<LIMBS>& b, BigInt<2*LIMBS>& res){
            res.zero();

            for(size_t i = 0; i < LIMBS; i++){
                uint64_t carry = 0;
                for(size_t j = 0; j < LIMBS; j++){
                    uint64_t low, high;
                    mul64(a.data[i], b.data[j], low, high);

                    uint64_t sum1 = res.data[i+j] + low;
                    uint64_t c1 = (sum1 < low);

                    uint64_t sum2 = sum1 + carry;
                    uint64_t c2 = (sum2 < sum1);

                    res.data[i+j] = sum2;
                    carry = high + c1 + c2;
                }
                res.data[i + LIMBS] = carry;
            }

        };

//Signed operations (TODO: May need to delete these may not be needed)
//-----------------------------------------------------------------------------------------------------------------

        static void add_signed(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& b){
            if(a.negative == b.negative){   //both negative so -(a+b)
                add(res, a, b);
                res.negative = a.negative;
            }else{
                //isGreaterThan already assumes unsigned so its like comparing |a| with |b|
                if(isGreaterThan(a, b)){  //b is negative so a - b
                    sub(res, a, b);
                    res.negative = a.negative;
                }else{              //a is negative so b - a
                    sub(res, b, a);
                    res.negative = b.negative;
                }
            }
            if(res.isZero()){
                res.negative = false;
            }
        };

        static void sub_signed(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& b){
            BigInt<LIMBS> b_neg = b;
            b_neg.negative = !b.negative;
            add_signed(res, a, b_neg);
        };

        static void mul_signed(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& b){
            BigInt<2*LIMBS> tmp;
            
            for(size_t i = 0; i < LIMBS; i++){
                uint64_t carry = 0;
                for(size_t j = 0; j < LIMBS; j++){
                    uint64_t hi, lo;
                    mul64(a.data[i], b.data[j], hi, lo);

                    uint64_t t = res.data[i + j];
                    uint64_t sum = t + lo;
                    uint64_t c1 = (sum < t);

                    sum += carry;
                    uint64_t c2 = (sum < carry);

                    res.data[i + j] = sum;
                    
                    carry = hi + c1 + c2;
                }
            }

            res.negative = a.negative ^ b.negative;

            if(res.isZero()){
                res.negative = false;
            }

        };

        //Will write a quotient and remainder as there is no floating points
        static void div_signed(const BigInt<LIMBS> a, const BigInt<LIMBS>& b, BigInt<LIMBS>& q, BigInt<LIMBS>& r){

            if(b.isZero()){
                throw std::runtime_error("Divide by zero");
            }

            BigInt<LIMBS> abs_a = a;
            abs_a.negative = false;
            BigInt<LIMBS> abs_b = b;
            abs_b.negative = false;

            divide(abs_a, abs_b, q, r);

            q.negative = a.negative ^ b.negative;
            r.negative = a.negative;

            if(q.IsZero()){
                q.negative = false;
            }
            if(r.isZero()){
                r.negative = false;
            }

        };

//modular operations
//TODO: may only need add and sub for this section
//-----------------------------------------------------------------------------------------------------------------

        static void mod(BigInt<4>& a, BigInt<4> n){
            BigInt<4> r;
            BigInt<4> q;
            divide(a, n, q, r);
            a = r;
        }

        //TODO: may not need this function
        static void mul_mod(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& b, const BigInt<LIMBS>& n){
            BigInt<LIMBS * 2> temp = 0;

            //Multiply loop
            for(size_t i = 0; i < LIMBS; i++){
                uint64_t carry = 0;
                for(size_t j = 0; j < LIMBS; j++){
                    uint64_t low, high;
                    mul64(a.data[i], b.data[j], low, high);

                    //add low + carry + temp
                    uint64_t sum_lo = temp.data[i+j] + low + carry;
                    uint64_t carry_out = (sum_lo < low) || (sum_lo < carry) ? 1 : 0;

                    temp.data[i+j] = sum_lo;
                    carry = high + carry_out;
                }
                temp.data[i+LIMBS] += carry;
            }

            //Reduce with modulo
            //TODO: if this function is needed optimize this loop
            BigInt<LIMBS> temp_res;
            for(size_t i = 0; i < LIMBS; i++){
                temp_res.data[i] = temp.data[i];
            }

            while(isGreaterThan(temp_res, n) >= 0){
                sub_mod(temp_res, temp_res, n, n);
            }

            res = temp_res;

        };

        //res cannot also be param n will fail (could also be an issue if a is also param n)
        static void add_mod(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& b, const BigInt<LIMBS>& n){
            //initial addition step
            uint64_t carry = 0;
            for(size_t i = 0; i < LIMBS; i++){
                uint64_t sum = a.data[i] + b.data[i] + carry;
                carry = (sum < a.data[i] || (carry && sum == a.data[i]) ? 1 : 0);
                res.data[i] = sum;
            }

            //check if result overflowed modulus, if it did subtract
            bool overflow = true;
            for(size_t i = LIMBS; i-- > 0;){
                if(res.data[i] < n.data[i]){
                    overflow = false;
                    break;
                }
                if(res.data[i] > n.data[i]){
                    overflow = true;
                    break;
                }
            }

            if(overflow){
                uint64_t borrow = 0;
                for(size_t i = 0; i < LIMBS; i++){
                    uint64_t temp = res.data[i] - n.data[i] - borrow;
                    borrow = (res.data[i] < n.data[i] + borrow) ? 1 : 0;
                    res.data[i] = temp;
                }
            }
        };

        //res can only be assigned to a and the function still be safe res != b or res != n will fail ex sub_mod(x, x, y, y) vs bad: sub(x, y,->x, y)
        static void sub_mod(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& b, const BigInt<LIMBS>& n){
            uint64_t borrow = 0;

            //Normal subtract
            for(size_t i = 0; i < LIMBS; i++){
                uint64_t temp = a.data[i] - b.data[i] - borrow;
                borrow = (a.data[i] < b.data[i] + borrow) ? 1 : 0;
                res.data[i] = temp;
            }

            //Use borrow to check if modulus needs to be added back and there was overflow
            if(borrow){
                uint64_t carry = 0;
                for(size_t i = 0; i < LIMBS; i++){
                    uint64_t sum = res.data[i] + n.data[i] + carry;
                    carry = (sum < res.data[i]) ? 1 : 0;
                    res.data[i] = sum;
                }
            }

        };

        static void square_mod(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS> n){

            mul_mod(res, a, a, n);

        };

        static void exp_mod(BigInt<LIMBS>& res, const BigInt<LIMBS>& base, const BigInt<LIMBS>& exp, const BigInt<LIMBS>& n){

            BigInt<LIMBS> r0, r1;
            r0.one();
            r1 = base;
            mod(r1, n);

            for(int i = exp.bitLength() - 1; i >= 0; i--){
                bool bit = exp.getBit(i);

                if(!bit){
                    mul_mod(r1, r0, r1, n);
                    square_mod(r0, r0, n);
                }else{
                    mul_mod(r0, r0, r1, n);
                    square_mod(r1, r1, n);
                }

            }

            res = r0;

        };

        //Uses Fermat's little theorem
        static void inv_mod(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& n){

            BigInt<LIMBS> exp(n);
            sub(exp, exp, 2);

            exp_mod(res, a, exp, n);

        };

//Montgomery operations
//TODO: maybe add basic mod operation for montgomery form
//-----------------------------------------------------------------------------------------------------------------

        //a parameter must be in montgomery form
        static void square_mont(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& n, const BigInt<LIMBS>& Nprime){
        
            mul_mont(res, a, a, n, Nprime);

        };

        //base parameter must be in montgomery form returns the res also in montgomery form
        static void exp_mont(BigInt<LIMBS>& res, const BigInt<LIMBS>& base, const BigInt<LIMBS>& exp, const BigInt<LIMBS>& n, const BigInt<LIMBS>& R2, const BigInt<LIMBS> Nprime){

            //Setting res to 1 in montgomery form to perform proper math
            mul_mont(res, 1, R2, n, Nprime);

            //Uses binary exponentiation
            for(size_t i = LIMBS*64 - 1; i-- > 0; ){
                
                square_mont(res, res, n, Nprime);

                //First find what limb then compute bit offset for shift to exponentiate
                if((exp.data[i/64] >> (i%64) & 1)){
                    square_mont(res, res, base, n, Nprime);
                }

            }

        };

        //Uses Fermat's little theorem n must be prime else the functions output is incorrect also assumes montgomery repersentation
        static void inv_mont(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& n, const BigInt<LIMBS>& R2, const BigInt<LIMBS>& Nprime){

            BigInt<LIMBS> exp = n;
            sub_mod(exp, exp, 2, n);
            exp_mont(res, a, exp, n, R2, Nprime);

        };

        //Convert parameters a and b into montgomery form before passing as arguments
        static void mul_mont(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& b, const BigInt<LIMBS>& n, const BigInt<LIMBS>& Nprime){
            BigInt<2*LIMBS> T;
            T.zero();
            //Compute a*b
            for(size_t i = 0; i < LIMBS; i++){
                uint64_t carry = 0;
                for(size_t j = 0; j < LIMBS; j++){
                    uint64_t low, high;
                    mul64(a.data[i], b.data[j], low, high);

                    uint64_t sum1 = T.data[i+j] + low;
                    uint64_t c1 = (sum1 < low);

                    uint64_t sum2 = sum1 + carry;
                    uint64_t c2 = (sum2 < sum1);

                    T.data[i+j] = sum2;
                    carry = high + c1 + c2;

                }
                T.data[i + LIMBS] = carry;

            }

            //Montgomery reduction
            for(size_t i = 0; i < LIMBS; i++){
                uint64_t m = T.data[i] * Nprime.data[0];

                uint64_t carry = 0;
                for(size_t j = 0; j < LIMBS; j++){
                    uint64_t low, high;
                    mul64(m, n.data[j], low, high);

                    uint64_t sum = T.data[i+j] + low + carry;
                    T.data[i+j] = sum;
                    carry = high;
                    if(sum < low){
                        carry++;    //Handling if low overflowed propogating it
                    }

                }
                //Add carry to next limb
                size_t k = i + LIMBS;
                while(carry != 0 && k < 2 * LIMBS){
                    uint64_t sum = T.data[k] + carry;
                    T.data[k] = sum;
                    carry = (sum < carry) ? 1 : 0;
                    k++;
                }

            }
            //Copy upper LIMBS to result (lower limbs mod R are 0 so don't need them)
            for(size_t i = 0; i < LIMBS; i++){
                res.data[i] = T.data[i + LIMBS];
            }
            //Hande res >= n
            if(isGreaterThan(res, n) | equals(res, n)){
                sub(res, res, n);
            }

        };

//Montgomery functions/variable computations
//-----------------------------------------------------------------------------------------------------------------

        //Turning number into montgomery form
        static BigInt<LIMBS> mont_encode(const BigInt<LIMBS>& x, const BigInt<LIMBS>& n, const BigInt<LIMBS>& Nprime, const BigInt<LIMBS>& R2){
            BigInt<LIMBS> result;
            mul_mont(result, x, R2, n, Nprime);
            return result;
        };

        //Extracting number out of montgomery form
        static BigInt<LIMBS> mont_decode(const BigInt<LIMBS>& x, const BigInt<LIMBS>& n, const BigInt<LIMBS>& Nprime, const BigInt<LIMBS>& R_inverse){
            BigInt<LIMBS> result;
            mul_mont(result, x, 1, n, Nprime);
            return result;
        };

        //TODO only works for 64 bit limbs will need to adapt for ESP32
        static uint64_t compute_Nprime(const BigInt<LIMBS>& n){
            uint64_t n0 = n.data[0];
            uint64_t x = 1;

            for(int i = 0; i < 6; i++){
                x *= 2 - n0 * x;
            }

            return -x;

        };

        //TODO: May need to find a faster way to compute this could take a while for ESP32
        //Also may need to check underflow for sub operations in case they need a carry
        static BigInt<LIMBS> compute_RInverse(const BigInt<LIMBS>& n){
            
            BigInt<LIMBS> r_mod_n;
            BigInt<LIMBS> zero;
            zero.zero();
            sub(r_mod_n, zero, n);

            BigInt<LIMBS> u = n;
            BigInt<LIMBS> v = r_mod_n;
            BigInt<LIMBS> x1, x2;

            x1.one();
            x2.zero();

            while(!u.isOne() && !v.isOne()){
                //If u is zero because it wasn't a correct input escape
                while(u.isEven() && !u.isZero()){
                    rightShift(u, u, 1);    //Simulate a divide by 2
                    if(x1.isOdd()){         //add modulus back in to flip around
                        uint64_t carry = add(x1, x1, n);
                        rightShift(x1, x1, 1);
                        if(carry){          //manually shift the carry bit into place simulating right shift on LIMBS*64 bit
                            x1.data[LIMBS - 1] |= 0x8000000000000000ULL;
                        }
                    }else{
                        rightShift(x1, x1, 1);
                    }
                }
                //If v is zero because it wasn't a correct input escape
                while(v.isEven() && !v.isZero()){
                    rightShift(v, v, 1);    //Simulate a divide by 2
                    if(x2.isOdd()){         //add modulus back in to flip around
                        uint64_t carry = add(x2, x2, n);
                        rightShift(x2, x2, 1);
                        if(carry){          //manually shift the carry bit into place simulating right shift on LIMBS*64 bit
                            x2.data[LIMBS - 1] |= 0x8000000000000000ULL;
                        }
                    }else{
                        rightShift(x2, x2, 1);
                    }
                }

                if(isGreaterThan(u, v) | equals(u, v)){
                    sub(u, u, v);
                    sub_mod(x1, x1, x2, n);
                }else{
                    sub(v, v, u);
                    sub_mod(x2, x2, x1, n);
                }

            }

            if(u.isOne()){
                return x1;
            }else{
                return x2;
            }

        };

        //TODO: MAY NEED TO OPTIMIZE THIS FOR THE ESP32 could take ~100ms to make when starting up ECDHE
        //Can do so with double width multiplication
        static BigInt<LIMBS> make_R2(const BigInt<LIMBS>& n){
            BigInt<LIMBS> R2;
            R2.zero();
            R2.data[0] = 1;

            for(int i = 0; i < 2 * 64 * LIMBS; i++){
                leftShift(R2, R2, 1);
                if(isGreaterThan(R2, n)){
                    sub_mod(R2, R2, n, n);
                }
            }

            return R2;
        };

//Shift operators
//-----------------------------------------------------------------------------------------------------------------

        static void leftShift(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, size_t bits){
            size_t limbShift = bits / 64;
            size_t bitShift = bits % 64;

            if(limbShift >= LIMBS){
                res.zero();
                return;
            }

            //LIMB level shifting
            for(size_t i = LIMBS; i-- > limbShift;  ){
                res.data[i] = (i >= limbShift) ? a.data[i - limbShift] : 0;
            }

            if(bitShift == 0){
                return;
            }

            //Bit level shifting
            uint64_t carry = 0;
            for(int i = limbShift; i < LIMBS; i++){
                uint64_t cur = res.data[i];
                res.data[i] = (cur << bitShift) | carry;
                carry = cur >> (64 - bitShift);
            }

        };

        static void rightShift(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, size_t bits){

            size_t limbShift = bits / 64;
            size_t bitShift = bits % 64;

            if(limbShift >= LIMBS){
                res.zero();
                return;
            }

            //LIMB level shifting
            for(size_t i = LIMBS; i-- > limbShift; ){
                res.data[i] = (i + limbShift < LIMBS) ? a.data[i + limbShift] : 0;
            }

            if(bitShift == 0){
                return;
            }

            //Bit level shifting
            uint64_t carry = 0;
            for(size_t i = LIMBS; i-- > 0; ){
                uint64_t cur = res.data[i];
                res.data[i] = (res.data[i] >> bitShift) | carry;
                carry = cur << (64 - bitShift);
            }

        };

//Helper functions
//-----------------------------------------------------------------------------------------------------------------

        static void mul64(uint64_t a, uint64_t b, uint64_t& low, uint64_t& high){
            uint64_t a0 = (uint32_t) a; //low 32 bits
            uint64_t a1 = a >> 32;      //high 32 bits
            uint64_t b0 = (uint32_t) b; //low 32 bits
            uint64_t b1 = b >> 32;      //high 32 bits

            //partial products
            uint64_t p0 = a0 * b0;
            uint64_t p1 = a0 * b1;
            uint64_t p2 = a1 * b0;
            uint64_t p3 = a1 * b1;

            //Handle overflow
            uint64_t mid = (p0 >> 32) + (uint32_t) p1 + (uint32_t) p2;

            low = (p0 & 0xFFFFFFFFULL) | (mid << 32); //force compiler to treat as max value double long with 0xF and ULL to get rid of upper 32 bits of first expression
            high = p3 + (p1 >> 32) + (p2 >> 32) + (mid >> 32);
            /*
            0-63: a0b0
            32-95: (a0b1 + a1b0) << 32
            64-127: (a1b1) << 64
            */

        };

//Gets/Sets/Checks
//-----------------------------------------------------------------------------------------------------------------

        bool isOne() const{
            if (data[0] != 1){
                return false;         // least significant limb must be 1
            }
            for (size_t i = 1; i < LIMBS; ++i){  // all other limbs must be 0
                if (data[i] != 0) return false;
            }
            return true;
        };

        bool isZero() const{
            for (size_t i = 0; i < LIMBS; ++i){
                if (data[i] != 0){
                    return false;
                }
            }
            return true;
        };

        static void cond_mov(BigInt<LIMBS>& res, const BigInt<LIMBS>& b, uint64_t mask){
            for(size_t i = 0; i < LIMBS; i++){
                res.data[i] = (res.data[i] & ~mask) | (b.data[i] & mask);
            }
        };

        void one(){
            data[0] = 1;              // least significant limb = 1
            for (size_t i = 1; i < LIMBS; ++i){
                data[i] = 0;          // all other limbs = 0
            }
        };

        //Set everything to zero
        void zero(){
            for(size_t i = 0; i < LIMBS; i++){
                this->data[i] = 0;
            }
        };

        //return mask to mark where the bit you wanted was
        uint64_t getBit(size_t index) const{
            size_t limb = index / 64;
            size_t bit = index % 64;

            uint64_t limbVal = data[limb];
            return (limbVal >> bit) & 1ULL;

        };

        size_t bitLength() const{
            for(int i = LIMBS - 1; i >= 0; i--){
                uint64_t w = this->data[i];
                if(w != 0){
                    return i * 64 + bitlen64(w);
                }
            }
            return 0;
        };

        static uint64_t bitlen64(uint64_t w){
            int n = 0;
            while(w){
                w >>= 1;
                n++;
            }
            return n;
        };

        void setBit(size_t index, bool bit){
            size_t limb_index = index / 64;
            size_t bit_index = index % 64;

            if(limb_index >= LIMBS){
                return;
            }
            if(bit){
                data[limb_index] |= (1ULL << bit_index);    //set to one
            }else{
                data[limb_index] &= ~(1ULL << bit_index);   //clear to zero
            }
        };

        constexpr size_t limbCount() const{
            return LIMBS;
        };

        //returns 0x00... if |a| < |b| or |a| = |b| else returns 0xFF... if |a| > |b| uses eq to be constant time
        static uint64_t isGreaterThan(const BigInt<LIMBS>& a, const BigInt<LIMBS>& b){
            uint64_t gt = 0;    //is 1 if a > b
            uint64_t eq = 0xFFFFFFFFFFFFFFFFULL;

            
            for(size_t index = LIMBS; index-- > 0;){
                uint64_t x = a.data[index];
                uint64_t y = b.data[index];

                //x greater than y
                uint64_t x_gt_y = (x > y);
                //x less than y
                uint64_t x_lt_y = (x < y);

                //if next limb contradicts discard as MSB determines significance
                gt |= x_gt_y & eq;
                eq &= ~(x_gt_y | x_lt_y);

            }

            return -gt;

        };

        static uint64_t equals(const BigInt<LIMBS>& a, const BigInt<LIMBS>& b){
            uint64_t diff = 0;

            // XOR each limb and OR into diff
            for (size_t i = 0; i < LIMBS; ++i){
                diff |= a.data[i] ^ b.data[i];
            }

            // If diff is zero, all limbs were equal
            return -(diff == 0);
        };

        //returns 0x0... for odd 0xF... for even
        uint64_t isEven() const{
            return -((~data[0]) & 1);
        };

        //returns 0x0... for even 0xF... for odd
        uint64_t isOdd() const{
            return -((data[0]) & 1);
        };

        //Function below is only used to test math delete this when its proven to work
        std::string toBinaryString() const{
            std::string out;
            bool started = false;

            for(int i = LIMBS - 1; i >= 0; i--){
                uint64_t limb = data[i];

                for(int b = 63; b >= 0; b--){
                    bool bit = (limb >> b) & 1;
                    if(bit){
                        started = true;
                    }
                    if(started){
                        out.push_back(bit ? '1' : '0');
                    }
                }
            }

            return started ? out : "0";

        };

};

//Operators
//-----------------------------------------------------------------------------------------------------------------

//Function below is only used to test math delete this when its proven to work
template <size_t LIMBS>
ostream& operator<<(ostream& os, const BigInt<LIMBS>& a){
    return os << a.toBinaryString();
};

#endif