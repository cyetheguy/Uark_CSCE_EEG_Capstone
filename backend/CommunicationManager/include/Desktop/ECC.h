#ifndef ECC_H
#define ECC_H

#include "BigInt.h"

struct PublicKey;
struct Signature;

class ECC{

    public:
        static PublicKey generatePublicKey(const BigInt<4>& privateKey);

        static Signature sign(const BigInt<4>& privateKey, const std::vector<uint8_t>& message);
        static bool verify(const PublicKey& publicKey, const std::vector<uint8_t>& message, const Signature& sig);

};

#endif