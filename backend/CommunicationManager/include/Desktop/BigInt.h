/*

NOTES:
-IMPORTANT:
 -All are size to be 256 bits with size_t having 4 LIMBS however if 512 bit or larger are needed LIMBS can be modified but it must be
  done for every BigInt instance so as to not cause overflow issues in operations with two differing sizes this is done
  to keep performance fast and not have to deal with the overhead of allocating new space for BigInts of differing size
  for modulus in finite field space (If AES_256 is used instead of 128 and we need to bump it up to 512 just do BigInt<8> everywhere)

-Modular multiplication uses montgomery representation
-Some functions that look like they should return boolean values instead return a mask which functions the same
-This file is a all in one header template file

TODO:
-FINISH CLASS
-Have conversion functions store things as montgomery form
-May be some weird reference quirks when say passing foo(a, a) and its declared as foo::foo(BigInt&, const BigInt&) check up on these
-Double check all these are cryptographically safe from any attacks side channel etc

*/

#ifndef BIGINT_H
#define BIGINT_H

#include <string>
#include <vector>
#include <iostream>

template <size_t LIMBS>

class BigInt{

    public:

        BigInt(){
            std::cout << "Called default BigInt constructor" << std::endl;
            this->zero();
        };
        BigInt(const std::string& num){
            std::cout << "Called string BigInt constructor" << std::endl;
            this->zero();
            for(size_t i = 0; i < LIMBS; i++){
                //parse string and assign here
            }
        };
        BigInt(uint64_t num){
            std::cout << "Called uint64_t BigInt constructor" << std::endl;
            this->zero();
            data[0] = num;
        };
        BigInt(const BigInt&) = default; //have this reinforced in order to implement deconstructor
        ~BigInt(){};
        //May overflow
        static void add(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& b){
            //addition doesn't handle overflow
            uint64_t carry = 0;
            for(size_t i = 0; i < LIMBS; i++){
                uint64_t sum = a.data[i] + b.data[i] + carry;
                carry = (sum < a.data[i] ? 1 : 0);
                res.data[i] = sum;
            }
        };

        //May overflow
        static void subtract(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& b){
            //Subtract and use borrow to mark if lower bits need to borrow
            uint64_t borrow = 0;
            for(size_t i = 0; i < LIMBS; i++){
                uint64_t temp = a.data[i] - b.data[i] - borrow;
                borrow = (a.data[i] < b.data[i] + borrow) ? 1 : 0;
                res.data[i] = temp;
            }
        };

        //May overflow
        //TODO: Get around needing to use a BigInt<LIMBS*2> also i dont trust it
        static void multiply(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& b){
            BigInt<LIMBS * 2> temp = 0;
            for(size_t i = 0; i < LIMBS; i++){
                uint64_t carry = 0;
                for(size_t j = 0; j < LIMBS; j++){
                    uint64_t low, high;
                    mul64(a.data[i], b.data[j], low, high);

                    uint64_t sum = temp.data[i+j];
                    uint64_t c1 = (sum += low) < low;
                    uint64_t c2 = (sum += carry) < carry;
                    temp.data[i+j] = sum;

                    carry = high + c1 + c2;
                }
                temp.data[i + LIMBS] = carry;
            }

            for(size_t i = 0; i < LIMBS; i++){
                res.data[i] = temp.data[i];
            }
        };

        //May overflow
        static void square(BigInt<LIMBS>& res, const BigInt<LIMBS>& a){
            multiply(res, a, a);
        };

        //May overflow
        static void exp(BigInt<LIMBS>& res, const BigInt<LIMBS>& base, const BigInt<LIMBS>& exp){

        };

        static void inv(BigInt<LIMBS>& res, const BigInt<LIMBS>& a){

        };

        static void add_mod(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& b, const BigInt<LIMBS>& n){
            //initial addition step
            uint64_t carry = 0;
            for(size_t i = 0; i < LIMBS; i++){
                uint64_t sum = a.data[i] + b.data[i];
                carry = (sum < a.data[i] ? 1 : 0);
            }

            //check if result overflowed modulus, if it did subtract
            bool overflow = true;
            for(size_t i = LIMBS; i > 0; i--){
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

        //TODO: I DONT TRUST THIS FUNCTION I DONT KNOW WHY dark magic
        //Convert parameters a and b into montgomery form before passing as arguments
        static void mont_mul(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& b, const BigInt<LIMBS>& n, const BigInt<LIMBS>& Nprime){
            BigInt<LIMBS * 2> temp = 0;
            for(size_t i = 0; i < LIMBS; i++){
                uint64_t carry = 0;
                for(size_t j = 0; j < LIMBS; j++){
                    uint64_t low, high;
                    mul64(a.data[i], b.data[j], low, high);

                    uint64_t sum = temp.data[i+j];
                    uint64_t c1 = (sum += low) < low;
                    uint64_t c2 = (sum += carry) < carry;
                    temp.data[i+j] = sum;

                    carry = high + c1 + c2;
                }
                temp.data[i + LIMBS] = carry;
            }

            BigInt<LIMBS> m;
            for(size_t i = 0; i < LIMBS; i++){
                uint64_t carry = 0;
                for(size_t j = 0; j < LIMBS; j++){
                    uint64_t low, high;
                    mul64(temp.data[i], Nprime.data[j], low, high);
                    uint64_t sum = m.data[i+j];
                    uint64_t c1 = (sum += low) < low;
                    uint64_t c2 = (sum += carry) < carry;
                    m.data[i+j] = sum;
                    carry = high + c1 + c2;

                }
            }

            BigInt<LIMBS * 2> tempSum = temp;
            BigInt<LIMBS * 2> mN = 0;
            for(size_t i = 0; i < LIMBS; i++){
                uint64_t carry = 0;
                for(size_t j = 0; j < LIMBS; j++){
                    uint64_t low, high;
                    mul64(m.data[i], n.data[j], low, high);

                    uint64_t sum = mN.data[i+j];
                    uint64_t c1 = (sum += low) < low;
                    uint64_t c2 = (sum += carry) < carry;
                    mN.data[i+j] = sum;
                    carry = high + c1 + c2;
                }
                mN.data[i+LIMBS] = carry;
            }

            uint64_t carry = 0;
            for(size_t i = 0; i < LIMBS*2; i++){
                uint64_t sum = tempSum.data[i];
                uint64_t c = (sum += mN.data[i]) < mN.data[i];
                sum += carry;
                carry = (sum < carry) + c;
                tempSum.data[i] = sum;
            }

            for(size_t i = 0; i < LIMBS; i++){
                res.data[i] = tempSum.data[i + LIMBS];
            }
            if(!compare(res, n)){
                sub_mod(res, res, tempSum, n);
            }

        };

        static void square_mod(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& n){
            mul_mod(res, a, a, n);
        };

        static void mod_exp(BigInt<LIMBS>& res, const BigInt<LIMBS>& base, const BigInt<LIMBS>& exp, const BigInt<LIMBS>& n){

        };

        static void mod_inv(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, const BigInt<LIMBS>& n){

        };

        static void leftShift(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, size_t bits){
            size_t limbShift = bits / 64;
            size_t bitShift = bits % 64;

            res.zero();

            for(size_t i = LIMBS; i > 0; i--){
                res.data[i] = a.data[i - limbShift];
            }

            if(bitShift != 0){
                uint64_t carry = 0;
                for(size_t i = 0; i < LIMBS; i++){
                    uint64_t newCarry = res.data[i] >> (64 - bitShift);
                    res.data[i] = (res.data[i] << bitShift) | carry;
                    carry = newCarry;
                }
            }

        };

        static void rightShift(BigInt<LIMBS>& res, const BigInt<LIMBS>& a, size_t bits){

            size_t limbShift = bits / 64;
            size_t bitShift = bits % 64;

            for(size_t i = 0; i < LIMBS - limbShift; i++){
                res.data[i] = a.data[i + limbShift];
            }

            //check this
            for(size_t i = LIMBS - limbShift; i < LIMBS; i++){
                res.data[i] = 0;
            }

            if(bitShift != 0){
                uint64_t carry = 0;
                for(size_t i = LIMBS; i > 0; i--){
                    uint64_t newCarry = res.data[i] << (64 - bitShift);
                    res.data[i] = (res.data[i] >> bitShift) | carry;
                    carry = newCarry;
                }
            }

        };

        static void cond_mov(BigInt<LIMBS>& res, const BigInt<LIMBS>& b, uint64_t mask){
            for(size_t i = 0; i < LIMBS; i++){
                res.data[i] = (res.data[i] & ~mask) | (b.data[i] & mask);
            }
        };

        //This might not be safe like i thought i have no clue
        void zero(){
            for(size_t i = 0; i < LIMBS; i++){
                this->data[i] = 0;
            }
        };

        //return mask to mark where the bit you wanted was
        uint64_t getBit(size_t index){
            size_t limb = index / 64;
            size_t bit = index % 64;

            uint64_t limbVal = data[limb];
            return (limbVal >> bit) & 1ULL;

        }

        constexpr size_t limbCount() const{
            return LIMBS;
        }

        //returns 0x00... if a < b or a = b else returns 0xFF... if a > b
        static uint64_t compare(const BigInt<LIMBS>& a, const BigInt<LIMBS>& b){
            uint64_t gt = 0;    //is 1 if a > b
            uint64_t lt = 0;    //is 1 if a < b or a = b

            
            for(size_t index = LIMBS; index > 0; index--){
                uint64_t x = a.data[index];
                uint64_t y = b.data[index];

                //x greater than y
                uint64_t x_gt_y = (y - x) >> 63; //exploit overflow wrapping if x > y then MSB will be 1 shift it right then = 1 if x > y
                //x less than y
                uint64_t x_lt_y = (x - y) >> 63; //same as earlier however will be 0 if y > x

                //if next limb contradicts discard as MSB determines significance
                gt != x_gt_y & ~lt;
                lt |= x_lt_y & ~gt;

            }

            return ~(gt - 1);

        };

        //Making a value (montgomery radix (R)) for generating montgomery representation for a number
        static BigInt<LIMBS> make_R(){
            BigInt<LIMBS> R;
            R.zero();
            R.data[LIMBS-1] = 1;
            return R;
        }

        //returns 0x0... for even 0xF... for odd
        uint64_t isEven() const{
            return ~(((data[0] ^ 1) & 1) - 1);
        };

        //returns 0x0... for even 0xF... for odd
        uint64_t isOdd() const{
            return ~((data[0] & 1) - 1);
        }

        uint64_t data[LIMBS] = {0}; //TODO: MAY NEED TO MOVE THIS TO PRIVATE VARIABLE

    private:

        //Helper function for multiplying 2 64 bit ints

        static void mul64(uint64_t a, uint64_t b, uint64_t& low, uint64_t& high){
            uint64_t a0 = (uint32_t) a; //low 32 bits
            uint64_t a1 = a >> 32;      //high 32 bits
            uint64_t b0 = (uint32_t) b; //low 32 bits
            uint64_t b1 = b >> 32;      //high 32 bits

            //partial products
            uint64_t p0 = a0 * b0;
            uint64_t p1 = a0 * b1;
            uint64_t p2 = a1 * b0;
            uint64_t p3 = a1 * p1;

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

};

#endif