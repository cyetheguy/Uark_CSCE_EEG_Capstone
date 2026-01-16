#ifndef CONNECTIONMANAGER_H
#define CONNECTIONMANAGER_H

//Windows API libraries for communicating to OS which will communicate with BLE
#include <winrt/Windows.Devices.Bluetooth.h>
#include <winrt/Windows.Devices.Bluetooth.Advertisement.h>
#include <winrt/Windows.Devices.Bluetooth.GenericAttributeProfile.h>

//Windows collections interfaces/helpers/iterables/etc
#include <windows.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.System.Profile.h>
#include <winrt/Windows.Storage.Streams.h>
#include <winrt/Windows.Devices.Enumeration.h>
#include <winrt/Windows.Foundation.Collections.h>

//Utility
#include <iostream>
#include <coroutine>
#include <type_traits>
#include <unordered_set>

//Custom Classes
#include "DeviceProfile.h"

//-------------------------------------------------------------------------------------------------------------

class ConnectionManager{

    public:
        //Global Variables
        const winrt::guid SERVICE_UUID{0x12345678, 0x1234, 0x5678, {0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0}};      //UUID For main service like main header
        const winrt::guid NOTIFY_CHAR_UUID{0x12345678, 0x1234, 0x5678, {0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf1}};    //UUID for notifying server when client connects or disconnects
        const winrt::guid CLIENT_TO_SERVER_CHAR_UUID{0x12345678, 0x1234, 0x5678, {0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf2}};   //UUID for characteristic that handles client sending to server

        ConnectionManager();
        ~ConnectionManager();

        void advertise();
        void connect(const winrt::hstring deviceID);
        void sendMessage(const std::string message);

        void listDevices();

        uint64_t getBluetoothAddress() const;
        std::wstring getDeviceName() const;
        std::string operator<<(const ConnectionManager& CM);

    private:
        //Private Global variables
        std::unordered_set<DeviceProfile, DeviceProfile::HashFunction> seenDevices; //set of devices seen with custom hash function
        bool ServerSide = false;

        //Neccessary characteristics if client
        winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattCharacteristic ClientNotifyChar{nullptr}; //notify characteristic
        winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattCharacteristic ClientWriteChar{nullptr};  //write characteristic
        //Neccessary characteristics if server
        winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattLocalCharacteristic ServerWriteChar{nullptr};  //write characteristic for when client wants to write to server
        winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattLocalCharacteristic ServerNotifyChar{nullptr};  //notify characteristic for the server to know when a client connects

};

#endif
