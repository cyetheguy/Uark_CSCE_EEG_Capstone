#include "EC_Curve.h"

using namespace std;

EC_Curve::EC_Curve(BigInt<4> p, BigInt<4> a, BigInt<4> b){

    this->p = p;
    this->a = a;
    this->b = b;

};


EC_Curve::~EC_Curve(){

    cout << "Deconstructor for EC_Curve called [NEEDS TO BE IMPLEMENTED]" << endl;

};
