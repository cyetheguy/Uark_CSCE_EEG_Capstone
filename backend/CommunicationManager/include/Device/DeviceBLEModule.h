#ifndef DEVICEBLEMODULE_H
#define DEVICEBLEMODULE_H

//Windows API libraries for communicating to OS which will communicate with BLE
#include <winrt/Windows.Devices.Bluetooth.h>
#include <winrt/Windows.Devices.Bluetooth.Advertisement.h>
#include <winrt/Windows.Devices.Bluetooth.GenericAttributeProfile.h>

//Windows collections interfaces/helpers/iterables/etc
#include <Windows.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.System.Profile.h>
#include <winrt/Windows.Storage.Streams.h>
#include <winrt/Windows.Devices.Enumeration.h>
#include <winrt/Windows.Foundation.Collections.h>

//Utility
#include <iostream>
#include <vector>

//Struct for handling GUID/UUID creation/manipulation/processing/etc
struct guid{

    uint32_t Data1;
    uint16_t Data2;
    uint16_t Data3;
    uint8_t Data4[8];

    guid() noexcept = default;

    constexpr guid(uint32_t const Data1, uint16_t const Data2, uint16_t const Data3, std::array<uint8_t, 8> const& Data4) noexcept
        : Data1(Data1), Data2(Data2), Data3(Data3){
            for(int i = 0; i < 8; i++) this->Data4[i] = Data4[i];
        };
    constexpr guid(guid const& other) noexcept
            : Data1(other.Data1), Data2(other.Data2), Data3(other.Data3){
            for(int i = 0; i < 8; i++) this->Data4[i] = other.Data4[i];
        };
    constexpr guid(std::string_view const& value) noexcept{

        //Not proper format
        if(value.size() != 36 || value[8] != '-' || value[13] != '-' || value[18] != '-' || value[23] != '-'){
            std::terminate();
        }
        
        Data1 =
            ((to_uint(value[0]) * 16 + to_uint(value[1])) << 24) +
            ((to_uint(value[2]) * 16 + to_uint(value[3])) << 16) +
            ((to_uint(value[4]) * 16 + to_uint(value[5])) << 8) +
            (to_uint(value[6]) * 16 + to_uint(value[7]));

        Data2 =
            static_cast<uint16_t>(((to_uint(value[9]) * 16 + to_uint(value[10])) << 8) +
            (to_uint(value[11]) * 16 + to_uint(value[12])));

        Data3 =
            static_cast<uint16_t>(((to_uint(value[14]) * 16 + to_uint(value[15])) << 8) +
            (to_uint(value[16]) * 16 + to_uint(value[17]))),

        Data4[0] = static_cast<uint8_t>(to_uint(value[19]) * 16 + to_uint(value[20])),
        Data4[1] = static_cast<uint8_t>(to_uint(value[21]) * 16 + to_uint(value[22])),
        Data4[2] = static_cast<uint8_t>(to_uint(value[24]) * 16 + to_uint(value[25])),
        Data4[3] = static_cast<uint8_t>(to_uint(value[26]) * 16 + to_uint(value[27])),
        Data4[4] = static_cast<uint8_t>(to_uint(value[28]) * 16 + to_uint(value[29])),
        Data4[5] = static_cast<uint8_t>(to_uint(value[30]) * 16 + to_uint(value[31])),
        Data4[6] = static_cast<uint8_t>(to_uint(value[32]) * 16 + to_uint(value[33])),
        Data4[7] = static_cast<uint8_t>(to_uint(value[34]) * 16 + to_uint(value[35]));

    };

    //return winrt::guid
    winrt::guid ToWinRTGuid() const noexcept{
        GUID g;
        g.Data1 = Data1;
        g.Data2 = Data2;
        g.Data3 = Data3;
        for(int i = 0; i < 8; i++){
            g.Data4[i] = Data4[i];
        }
        return winrt::guid{g};
    }

    //Evalutate at compile time
    constexpr bool operator==(guid const& other) noexcept{

        return Data1 == other.Data1 &&
            Data2 == other.Data2 &&
            Data3 == other.Data3 &&
            Data4[0] == other.Data4[0] &&
            Data4[1] == other.Data4[1] &&
            Data4[2] == other.Data4[2] &&
            Data4[3] == other.Data4[3] &&
            Data4[4] == other.Data4[4] &&
            Data4[5] == other.Data4[5] &&
            Data4[6] == other.Data4[6] &&
            Data4[7] == other.Data4[7];

    };

    constexpr bool operator!=(guid const& other) noexcept{

        return !(Data1 == other.Data1 &&
            Data2 == other.Data2 &&
            Data3 == other.Data3 &&
            Data4[0] == other.Data4[0] &&
            Data4[1] == other.Data4[1] &&
            Data4[2] == other.Data4[2] &&
            Data4[3] == other.Data4[3] &&
            Data4[4] == other.Data4[4] &&
            Data4[5] == other.Data4[5] &&
            Data4[6] == other.Data4[6] &&
            Data4[7] == other.Data4[7]);

    };

    constexpr bool operator<(guid const& other) noexcept{

        if(Data1 != other.Data1) return Data1 < other.Data1;
        if(Data2 != other.Data2) return Data2 < other.Data2;
        if(Data3 != other.Data3) return Data3 < other.Data3;

        for(int i = 0; i < 8; i ++){
            if(Data4[i] != other.Data4[i]) return Data4[i] < other.Data4[i];
        }

        return false;

    };

    static constexpr uint32_t to_uint(char const value) noexcept{
        if(value >= '0' && value <= '9'){
            return value - '0';
        }

        if(value >= 'A' && value <= 'F'){
            return 10 + value - 'A';
        }

        if(value >= 'a' && value <= 'f'){
            return 10 + value - 'a';
        }

        std::terminate();

    };

};

class DeviceBLEModule{

    public:

        DeviceBLEModule();
        ~DeviceBLEModule();

        void Start();
        void Stop();
        void plainSendMessage(const std::string& message);

    private:

        winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattServiceProvider provider{nullptr};
        winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattLocalCharacteristic plainMessageChar{nullptr};

        void InitializeGatt();

};

#endif