#ifndef EC_CURVE_H
#define EC_CURVE_H

#include "BigInt.h"

class EC_Curve{

    public:

        EC_Curve(BigInt<4> p, BigInt<4> a, BigInt<4> b);
        ~EC_Curve();

    private:

        BigInt<4> p, a, b;

};

#endif