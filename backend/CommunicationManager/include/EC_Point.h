#ifndef EC_POINT_H
#define EC_POINT_H

#include "BigInt.h"
#include "EC_Curve.h"

class EC_Point{

    public:

        static EC_Point pointDouble(const EC_Point& p, const EC_Curve& curve);
        static EC_Point pointAdd(const EC_Point& a, const EC_Point& b, const EC_Curve& curve);
        static EC_Point scalarMultiply(const BigInt<4>& k, const EC_Point& a, const EC_Curve& curve);
        static EC_Point infinity();

    private:

        BigInt<4> X, Y, Z;
        bool isInfinity;

};

#endif
