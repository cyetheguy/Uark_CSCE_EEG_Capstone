/*

TODO:
-Later optimize to use jacobian coordinates to skip slow division
-Also optimize to use montgomery ladder for constant time performance
-Use mont representation as well for these operations later for optimization right now it uses normal representation
-also optomize to support constant time to prevent side channel attacks
-Make this 521 bit ECC at some point to provide 256 bit security and not 128 or whatever ECC 256 bit equates to

*/

#include "ECC.h"

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

//ECC functions
//-----------------------------------------------------------------------------------------------------------------

static PublicKey generatePublicKey(const BigInt<4>& privKey, const ECCurve& curve){
    PublicKey pub;
    pub.Q = scalarMult(curve.G, privKey, curve);
    return pub;
}

static Signature sign(const BigInt<4>& priv, const BigInt<4>& hash, const ECCurve& curve){
    
    Signature sig;

    while(true){
        BigInt<4> k = randomScalar(curve.n);

        ECPoint R = scalarMult(curve.G, k, curve);

        sig.r = modN(R.x, curve.n);
        if(sig.r.isZero()){
            continue;
        }

        BigInt<4> kinv = modInv(sig.r.isZero() ? k : k, curve.n);
        BigInt<4> rd = modMul(sig.r, priv, curve.n);
        BigInt<4> sum = modAdd(hash, rd, curve.n);

        sig.s = modMul(kinv, sum, curve.n);
        if(sig.s.isZero()){
            continue;
        }

        return sig;

    }

};

static bool verify(PublicKey& pub, Signature& sig, const BigInt<4>& hash, const ECCurve& curve){
    if(sig.r.isZero() || sig.s.isZero()){
        return false;
    }
    if((BigInt<4>::isGreaterThan(sig.r, curve.n) || BigInt<4>::equals(sig.r, curve.n)) || (BigInt<4>::isGreaterThan(sig.s, curve.n) || BigInt<4>::equals(sig.s, curve.n))){
        return false;
    }

    BigInt<4> w = modInv(sig.s, curve.n);
    
    BigInt<4> u1 = modMul(hash, w, curve.n);
    BigInt<4> u2 = modMul(sig.r, w, curve.n);

    ECPoint P1 = scalarMult(curve.G, u1, curve);
    ECPoint P2 = scalarMult(pub.Q, u2, curve);

    ECPoint X = pointAdd(P1, P2, curve);
    if(X.infinity){
        return false;
    }

    BigInt<4> xmodn = modN(X.x, curve.n);
    return BigInt<4>::equals(xmodn, sig.r);

}

//ECC helper functions
//-----------------------------------------------------------------------------------------------------------------

static ECPoint pointAdd(const ECPoint& P, const ECPoint& Q, const ECCurve& curve){
    if(P.infinity){
        return Q;
    }
    if(Q.infinity){
        return P;
    }

    //Checking if P.x equals P.y and adapting in case one is negative
    BigInt<4> ysum = modAdd(P.y, P.x, curve.p);
    if(ysum.isZero()){
        ysum = modAdd(P.y, Q.y, curve.p);
        if(ysum.isZero()){
            return infinityPoint();
        }
        return pointDouble(P, curve);
    }

    BigInt<4> dx = modSub(Q.x, P.x, curve.p);
    BigInt<4> dy = modSub(Q.y, P.y, curve.p);

    BigInt<4> lambda = modMul(dy, modInv(dx, curve.p), curve.p);
    BigInt<4> x3 = modSub(modSub(modMul(lambda, lambda, curve.p), P.x, curve.p), Q.x, curve.p);
    BigInt<4> y3 = modSub(modMul(lambda, modSub(P.x, x3, curve.p), curve.p), P.y, curve.p);

    return {x3, y3, false};

};

static ECPoint pointDouble(const ECPoint& P, const ECCurve& curve){

    if(P.infinity){
        return infinityPoint();
    }
    if(P.y.isZero()){
        return infinityPoint();
    }

    BigInt<4> three_x2 = modMul(P.x, P.x, curve.p);
    three_x2 = modMul(three_x2, 3, curve.p);

    BigInt<4> numerator = modAdd(three_x2, curve.a, curve.p);
    BigInt<4> denominator = modMul(P.y, 2, curve.p);
    BigInt<4> lambda = modMul(numerator, modInv(denominator, curve.p), curve.p);
    
    BigInt<4> x3 = modSub(modMul(lambda, lambda, curve.p), modMul(P.x, 2, curve.p), curve.p);
    BigInt<4> y3 = modSub(modMul(lambda, modSub(P.x, x3, curve.p), curve.p), P.y, curve.p);

    return {x3, y3, false};

};

static ECPoint scalarMult(const ECPoint& P, const BigInt<4>& k, const ECCurve& curve){

    ECPoint R = infinityPoint();
    ECPoint Q = P;

    //TODO: add bit length function to BigInt to avoid this
    for(int i = 4*64 - 1; i >= 0; i--){
        R = pointDouble(R, curve);
        if(k.getBit(i)){
            R = pointAdd(R, Q, curve);
        }
    }

    return R;

};

static BigInt<4> modN(BigInt<4>& x, const BigInt<4>& n){
    BigInt<4> tmp;
    BigInt<4>::mod(x, n);
    return tmp;
}

//Utility
//-----------------------------------------------------------------------------------------------------------------

bool isOnCurve(const ECPoint& P, const ECCurve& curve){

    if(P.infinity){
        return true;
    }

    //y^2 mod p
    BigInt<4> lhs = modMul(P.y, P.y, curve.p);

    //TODO: make this line more readable what the hell am i looking at what did this do why did i not add a comment earlier?
    BigInt<4> rhs = modAdd(modAdd(modMul(modMul(P.x, P.x, curve.p), P.x, curve.p), modMul(curve.a, P.x, curve.p), curve.p), curve.b, curve.p);

    return BigInt<4>::equals(lhs, rhs);

}

static ECPoint infinityPoint(){
    ECPoint R;
    R.infinity = true;
    R.x.zero();
    R.y.zero();
    return R;
};

//TODO: make this actually random to have accurate nonces
BigInt<4> randomScalar(BigInt<4> n){
    return 1;
}

//Math utility
//TODO: some of these operations for BigInt support in place modification so I could save like some memory allocate operations
//      memory waiting and like 8 bytes of ram or something lol
//-----------------------------------------------------------------------------------------------------------------

static BigInt<4> modAdd(const BigInt<4>& a, const BigInt<4>& b, const BigInt<4>& p){
    BigInt<4> tmp;
    BigInt<4>::add_mod(tmp, a, b, p);
    return tmp;
};

static BigInt<4> modSub(const BigInt<4>& a, const BigInt<4>& b, const BigInt<4>& p){
    BigInt<4> tmp;
    BigInt<4>::sub_mod(tmp, a, b, p);
    return tmp;
};

//TODO: Use montgomery representation here later
static BigInt<4> modMul(const BigInt<4>& a, const BigInt<4>& b, const BigInt<4>& p){
    BigInt<4> tmp;
    BigInt<4>::mul_mod(tmp, a, b, p);
    return tmp;
};

//TODO: Use montomgery representation here later as well
static BigInt<4> modInv(const BigInt<4>& a, const BigInt<4>& p){
    BigInt<4> tmp;
    BigInt<4>::inv_mod(tmp, a, p);
    return tmp;
};