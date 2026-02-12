#ifndef ECC_H
#define ECC_H

#include "BigInt.h"

struct ECPoint{
    BigInt<4> x, y;
    bool infinity;
};

struct ECCurve{
    BigInt<4> p, a, b, n, h;
    ECPoint G;
};

struct PublicKey{
    ECPoint Q;
};

struct Signature{
    BigInt<4> r;
    BigInt<4> s;
};

class ECC{

    public:
        static PublicKey generatePublicKey(const BigInt<4>& privateKey, const ECCurve& curve);

        static Signature sign(const BigInt<4>& priv, const BigInt<4>& hash, const ECCurve& curve);
        static bool verify(const PublicKey& pub, const Signature& sig, const BigInt<4>& hash, const ECCurve& curve);

        static ECPoint scalarMult(const ECPoint& P, const BigInt<4>& k, const ECCurve& curve);
        static void randomScalar(const BigInt<4>& n, BigInt<4>& out);

};

#endif