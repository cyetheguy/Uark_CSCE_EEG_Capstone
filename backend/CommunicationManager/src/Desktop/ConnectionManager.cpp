#include "ConnectionManager.h"

/*

NOTE USING UNORDERED_SET OF SEEN DEVICES TO SPEED OF RECONNECTION IN CASE OF DISCONNECTION

TODO:
-IMPLEMENT DECONSTRUCTOR
-ADD MUTEXES FOR ACCESS STUFF DURING ASYNC CALL
-make a seenDevices stores Bluetooth addresses which can change if this ever needs to be completely secure it should kill inactive
 connections and drop seen devices it doesn't keep seeing?
-Properly handle client disconnection
-Add ability to stop broadcasting only way to currently stop is by quitting after initially starting
-Add ability for when ceasing broadcast to be able to swap to being a client and connect to others
-Add also checking UUIDs instead of just checking matching properties
-Add ability to sort through cycle and remove from seenDevices to manage it
*/

//Bluetooth naming
using winrt::Windows::Devices::Bluetooth::BluetoothConnectionStatus;
using winrt::Windows::Devices::Bluetooth::BluetoothLEDevice;

using winrt::Windows::Devices::Bluetooth::Advertisement::BluetoothLEAdvertisement;
using winrt::Windows::Devices::Bluetooth::Advertisement::BluetoothLEAdvertisementReceivedEventArgs;
using winrt::Windows::Devices::Bluetooth::Advertisement::BluetoothLEAdvertisementWatcher;
using winrt::Windows::Devices::Bluetooth::Advertisement::BluetoothLEAdvertisementWatcherStoppedEventArgs;

//MIGHT NOT NEED THIS
using winrt::Windows::Devices::Bluetooth::BluetoothCacheMode;

//Gatt interface naming
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattSession;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattReadResult;

using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattCharacteristic;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattCharacteristicProperties;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattCharacteristicsResult;

using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattCommunicationStatus;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattClientCharacteristicConfigurationDescriptorValue;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattValueChangedEventArgs;

using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattDeviceService;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattDeviceServicesResult;

using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattWriteOption;

//Async
using winrt::Windows::Foundation::IAsyncOperation;
using winrt::Windows::Foundation::AsyncStatus;

//Helpers
using winrt::Windows::Storage::Streams::DataWriter;
using winrt::Windows::Storage::Streams::DataReader;
using winrt::Windows::Storage::Streams::IBuffer;
using winrt::Windows::Foundation::Collections::IVectorView;

using std::hex;
using std::dec;
using std::cout;
using std::endl;
using std::string;
using std::vector;
using std::make_shared;
using winrt::to_string;

//-------------------------------------------------------------------------------------------------------------
//Constructors

ConnectionManager::ConnectionManager(){
    cout << "Creating connection manager" << endl;
    watcher.Received([this](BluetoothLEAdvertisementWatcher watcher, BluetoothLEAdvertisementReceivedEventArgs args){
        this->didDiscoverDevice(watcher, args);
    });
    watcher.Stopped([this](BluetoothLEAdvertisementWatcher watcher, BluetoothLEAdvertisementWatcherStoppedEventArgs args){
        this->didCancelScanning();
    });
};
//Implement later to handle properly
ConnectionManager::~ConnectionManager(){
    cout << "Connection manager deconstructor called [NEEDS TO BE IMPLEMENTED]" << endl;
};

//-----------------------------------------------------------------------------------------------------
//Public

void ConnectionManager::scan(){
    watcher.Start();
};

void ConnectionManager::stop(){
    watcher.Stop();
};

void ConnectionManager::clearDiscoveredDevices(){
    discoveredDevices.clear();
};

void ConnectionManager::connectToDiscoveredDevice(int deviceIndex){
    uint64_t deviceAddress = discoveredDevices[deviceIndex].BluetoothAddress();
    cout << hex << "Connect to: " << deviceAddress << endl;
    connectPeripheral(deviceAddress);
};

void ConnectionManager::connectToDeviceWithUUID(){
    cout << "connectToDeviceWithUUID [NEEDS TO BE IMPLEMENTED]" << endl;
};

void ConnectionManager::connectToDeviceWithName(){
    cout << "connectToDeviceWithName [NEEDS TO BE IMPLEMENTED]" << endl;
};

void ConnectionManager::subscribeToChar(IVectorView<GattCharacteristic> characteristics){
    for(auto characteristic : characteristics){
        auto properties = characteristic.CharacteristicProperties();
        auto characteristicPtr = make_shared<GattCharacteristic>(characteristic);

        //Handling for if its a notify characteristic from a service
        if(static_cast<unsigned int>(properties) & static_cast<unsigned int>(GattCharacteristicProperties::Notify)){

            cout << "Found notify characteristic" << endl;

            auto addr = characteristic.Service().Device().BluetoothAddress();
            auto charUuid = characteristic.Uuid();

            if(subscribedNotifyCharacteristics[addr].find(charUuid) == subscribedNotifyCharacteristics[addr].end()){

                subscribedNotifyCharacteristics[addr].insert(charUuid);

                characteristicPtr->WriteClientCharacteristicConfigurationDescriptorAsync(
                    GattClientCharacteristicConfigurationDescriptorValue::Notify
                ).Completed([this, characteristicPtr](IAsyncOperation<GattCommunicationStatus> op, AsyncStatus status){

                    if(status == AsyncStatus::Completed){
                        characteristicPtr->ValueChanged([this](GattCharacteristic sender, GattValueChangedEventArgs args){

                            this->didReadValueForCharacteristic(args.CharacteristicValue(), GattCommunicationStatus::Success);

                        });
                    }

                });

            }

        }

        //Handling for if its a write characteristic from a service
        if((static_cast<unsigned int>(properties) & static_cast<unsigned int>(GattCharacteristicProperties::Write)) ||
           (static_cast<unsigned int>(properties) & static_cast<unsigned int>(GattCharacteristicProperties::WriteWithoutResponse))){

            cout << "Found write characteristic" << endl;

            subscribedWriteCharacteristics[characteristic.Service().Device().BluetoothAddress()] = characteristicPtr;

        }

    }
};

void ConnectionManager::sendMessage(uint64_t deviceAddress, const string& message){
    auto ch = subscribedWriteCharacteristics.find(deviceAddress);
    if(ch == subscribedWriteCharacteristics.end()){
        cout << "No write characteristics have been stored for device: " << BluetoothAddressToString(deviceAddress) << endl;
        return;
    }

    auto& characteristic = ch->second; //get actual value stored at index
    if(!characteristic){
        cout << "Write characteristic pointer is null" << endl;
    }

    DataWriter writer;
    writer.WriteBytes(vector<uint8_t>(message.begin(), message.end()));
    auto buffer = writer.DetachBuffer();

    characteristic->WriteValueAsync(buffer, GattWriteOption::WriteWithoutResponse).Completed(
        [message](IAsyncOperation<GattCommunicationStatus> op, AsyncStatus status){
    
            if(status == AsyncStatus::Completed){
                auto result = op.GetResults();
                if(result == GattCommunicationStatus::Success){
                    cout << "Message: " << message << ", was sent successfully" << endl;
                }else{
                    cout << "Message: " << message << ", failed to send(GattCommunication)" << endl;
                }
            }else{
                cout << "Message: " << message << ", failed to send(AsyncStatus)" << endl;
            }
    
    });

}

void ConnectionManager::getFoundDeviceList(){
    if(discoveredDevices.empty()){
        cout << "No devices discovered yet" << endl;
        return;
    }

    cout << "Discovered Devices: " << endl;
    for(size_t i = 0; i < discoveredDevices.size(); i++){
        auto& device = discoveredDevices[i];
        cout << i << ": " << BluetoothAddressToString(device.BluetoothAddress());

        auto ad = device.Advertisement();

        if(!ad.LocalName().empty()){
            cout << "\nName: " << to_string(ad.LocalName().c_str());
        }

        cout << "\nRSSI: " << device.RawSignalStrengthInDBm() << endl;

    }

};

void ConnectionManager::getRssiSensitivityofPeripheral(){
    cout << "Current RSSI sensitivity threshold: " << rssiSensitivity << " dBm" << endl;
};

void ConnectionManager::setRssiSensitivity(int rssiSensitivity){
    this->rssiSensitivity = rssiSensitivity;
};

string ConnectionManager::winrtGuidToString(winrt::guid uuid){
    char uuidCStr[37];
    if(uuid.Data2 == 0){
        sprintf_s(uuidCStr, sizeof(uuidCStr), "%04x", uuid.Data1);
    }else{
        sprintf_s(uuidCStr, sizeof(uuidCStr), "%08x-%04x-%04x-%02x%02x-%02x%02x%02x%02x%02x%02x", uuid.Data1, uuid.Data2, uuid.Data3, uuid.Data4[0], uuid.Data4[1], uuid.Data4[2], uuid.Data4[3], uuid.Data4[4], uuid.Data4[5], uuid.Data4[6], uuid.Data4[7]);
    }
    string guid = string(uuidCStr);
    return guid;
};

string ConnectionManager::BluetoothAddressToString(uint64_t address){
    char buff[18];
    sprintf_s(buff, sizeof(buff), "%02x:%02x:%02x:%02x:%02x:%02x", static_cast<unsigned int>((address >> 40) & 0xFF), static_cast<unsigned int>((address >> 32) & 0xFF), static_cast<unsigned int>((address >> 24) & 0xFF), static_cast<unsigned int>((address >> 16) & 0xFF), static_cast<unsigned int>((address >> 8) & 0xFF), static_cast<unsigned int>(address & 0xFF));
    return buff;
}

uint64_t ConnectionManager::stringToBluetoothAddress(const string& address){
    string hex;
    hex.reserve(12);

    for(char c : address){
        if(isxdigit(static_cast<unsigned char>(c))){
            hex.push_back(c);
        }
    }

    uint64_t addr = 0;
    if(hex.length() != 12){
        cout << "Invalid Bluetooth address" << endl;
        return addr;
    }

    for(char c : hex){
        addr <<= 4;
        if(c >= '0' && c <= '9') addr |= (c - '0');
        else if(c >= 'A' && c <= 'F') addr |= (c - 'A' + 10);
        else if(c >= 'a' && c <= 'f') addr |= (c - 'a' + 10);
    }

    return addr;

}

//-----------------------------------------------------------------------------------------------------
//Private

void ConnectionManager::connectPeripheral(uint64_t windowsDeviceAddress){
    BluetoothLEDevice::FromBluetoothAddressAsync(windowsDeviceAddress).Completed([this](IAsyncOperation<BluetoothLEDevice> sender, AsyncStatus status){
        auto device = sender.GetResults();
        if(device){
            switch(status){
                case AsyncStatus::Completed:
                    this->didConnect(device);
                    break;
                case AsyncStatus::Canceled:
                case AsyncStatus::Error:
                case AsyncStatus::Started:
                    this->didFailToConnect();
            }
        }else{
            cout << "Device is Null: " << sender.ErrorCode() << endl;
        }
    });
};

void ConnectionManager::discoverServices(BluetoothLEDevice device){
    device.GetGattServicesAsync().Completed([this](IAsyncOperation<GattDeviceServicesResult> sender, AsyncStatus status){
        GattDeviceServicesResult result = sender.get();
        if(result){
            switch(status){
                case AsyncStatus::Completed:
                    this->didDiscoverServices(result.Services(), result.Status());
                    break;
                case AsyncStatus::Canceled:
                case AsyncStatus::Error:
                case AsyncStatus::Started:
                    this->didFailToDiscoverServices();
            }
        }else{
            cout << "Services are empty" << endl;
        }
    });
};

void ConnectionManager::discoverCharacteristicsForService(GattDeviceService service){
    service.GetCharacteristicsAsync().Completed([this](IAsyncOperation<GattCharacteristicsResult> sender, AsyncStatus status){

        GattCharacteristicsResult result = sender.get();
        if(result){
            switch(status){
                case AsyncStatus::Completed:
                    this->didDiscoverCharacteristicsForService(result.Characteristics(), result.Status());
                    break;
                case AsyncStatus::Canceled:
                case AsyncStatus::Error:
                case AsyncStatus::Started:
                    this->didFailToDiscoverCharacteristicsForService();
            }
        }else{
            cout << "Characteristics are empty" << endl;
        }

    });
};

void ConnectionManager::readValueForCharacteristic(GattCharacteristic characteristic){
    characteristic.ReadValueAsync().Completed([this](IAsyncOperation<GattReadResult> sender, AsyncStatus status){
        GattReadResult result = sender.get();
        if(result){
            switch(status){
                case AsyncStatus::Completed:
                    this->didReadValueForCharacteristic(result.Value(), result.Status());
                    break;
                case AsyncStatus::Canceled:
                case AsyncStatus::Error:
                case AsyncStatus::Started:
                    this->didFailToReadValueForCharacteristic();
            }
        }else{
            cout << "Value is empty" << endl;
        }
    });
};

void ConnectionManager::didDiscoverDevice(BluetoothLEAdvertisementWatcher watcher, BluetoothLEAdvertisementReceivedEventArgs args){
    if(isPheripheralNew(args) && !connecting){
        discoveredDeviceUUIDS.push_back(args.BluetoothAddress());
        discoveredDevices.push_back(args);

        if(shouldReport){
            cout << "Device Address: " << this->BluetoothAddressToString(args.BluetoothAddress()) << endl;
            printDeviceDescription(args);
        }

        if(this->shouldConnectToDevice(args) && !connecting){
            cout << "Device found that meets connection criteria" << endl;
            connecting = true;
            watcher.Stop();
            connectToDiscoveredDevice(discoveredDevices.size()-1);
        }else{
            cout << "Device ignored (filter rules)" << endl;
            cout << "-----------------------------------------" << endl;
        }

    }
};

void ConnectionManager::didCancelScanning(){
    cout << "stopped scanning" << endl;
};

void ConnectionManager::didConnect(BluetoothLEDevice& device){
    connecting = false;
    cout << "didConnectPeripheral: " << to_string(device.Name().c_str()) << endl;
    discoverServices(device);
};

void ConnectionManager::didDisconnect(){
    connecting = false;
    cout << "Device Disconnected" << endl;
};

void ConnectionManager::didFailToConnect(){
    cout << "didFailToConnect [NEEDS TO BE IMPLEMENTED]" << endl;
};

void ConnectionManager::didFailToDiscoverServices(){
    cout << "Failed to discover services of a device" << endl;
    didDisconnect();
};

void ConnectionManager::didFailToDiscoverCharacteristicsForService(){
    cout << "Failed to discover a characteristic for a service" << endl;
};

void ConnectionManager::didFailToReadValueForCharacteristic(){
    cout << "Failed to read a characteristic that was discovered" << endl;
};

void ConnectionManager::didDiscoverIncludedServicesforService(){
    cout << "didDiscoverIncludedServicesforService [NEEDS TO BE IMPLEMENTED]" << endl;
};

void ConnectionManager::didDiscoverServices(IVectorView<GattDeviceService> services, GattCommunicationStatus status){
    if(status == GattCommunicationStatus::Success){
        cout << "didDiscoverServices: " << to_string(services.GetAt(0).Device().Name().c_str()) << endl;
        for(auto service : services){
            cout << "Service: " << this->winrtGuidToString(service.Uuid()) << endl;
            discoverCharacteristicsForService(service);
        }
    }else{
        cout << "Error getting services: ";
        switch(status){
            case GattCommunicationStatus::Unreachable:
                cout << "Unreachable";
                break;
            case GattCommunicationStatus::ProtocolError:
                cout << "ProtocolError";
                break;
            case GattCommunicationStatus::AccessDenied:
                cout << "AccessDenied";
                break;

        }
        cout << endl;
    }
};

void ConnectionManager::didDiscoverCharacteristicsForService(IVectorView<GattCharacteristic> characteristics, GattCommunicationStatus status){
    if(status == GattCommunicationStatus::Success){
        cout << "didDiscoverCharacteristicsForService: " << this->winrtGuidToString(characteristics.GetAt(0).Service().Uuid()) << endl;
        for(auto characteristic : characteristics){
            cout << "Characteristic: " << this->winrtGuidToString(characteristic.Uuid()) << " : " << to_string(characteristic.UserDescription().c_str()) << endl;
            readValueForCharacteristic(characteristic);
        }

        subscribeToChar(characteristics);

    }else{
        cout << "Error getting characteristics" << endl;
        switch(status){
            case GattCommunicationStatus::Unreachable:
                cout << "Unreachable";
                break;
            case GattCommunicationStatus::ProtocolError:
                cout << "ProtocolError";
                break;
            case GattCommunicationStatus::AccessDenied:
                cout << "AccessDenied";
                break;
        }
        cout << endl;
    }
};

void ConnectionManager::didReadValueForCharacteristic(IBuffer value, GattCommunicationStatus status){
    if(status == GattCommunicationStatus::Success){
        cout << "Value (02x hex): ";
        for(size_t i = 0; i < value.Length(); i++){
            printf("%02x", value.data()[i]);
        }
        cout << endl;

        printBufferAsString(value);

        if(isDesiredDevice(value)){
            cout << "Device interaction was accepted" << endl;
        }else{
            cout << "Wrong device, disconnecting" << endl;
            didDisconnect();
        }

    }else{
        cout << "Error Value For Characteristic: ";
        switch(status){
            case GattCommunicationStatus::Unreachable:
                cout << "Unreachable";
                break;
            case GattCommunicationStatus::ProtocolError:
                cout << "ProtocolError";
                break;
            case GattCommunicationStatus::AccessDenied:
                cout << "AccessDenied";
                break;
        }
        cout << endl;
    }
};

void ConnectionManager::printCharacteristicDescription(const GattCharacteristic& characteristic){
    cout << "Characteristic UUID: " << winrtGuidToString(characteristic.Uuid());
    auto desc = characteristic.UserDescription();
    if(!desc.empty()){
        cout << " : " << to_string(desc);
    }

    auto properties = static_cast<uint32_t>(characteristic.CharacteristicProperties());
    cout << "Properties: "
         << ((properties & static_cast<uint32_t>(GattCharacteristicProperties::Read)) ? "Read " : "")
         << ((properties & static_cast<uint32_t>(GattCharacteristicProperties::Write)) ? "Write " : "")
         << ((properties & static_cast<uint32_t>(GattCharacteristicProperties::Notify)) ? "Notify " : "")
         << endl;

};

void ConnectionManager::printDeviceDescription(const BluetoothLEAdvertisementReceivedEventArgs& device){
    BluetoothLEAdvertisement deviceAd = device.Advertisement();
    cout << "Device name: " << to_string(deviceAd.LocalName().c_str()) << endl;

    for(auto service : deviceAd.ServiceUuids()){
        cout << "UUID: " << this->winrtGuidToString(service) << endl;
    }

    for(auto manuData : deviceAd.ManufacturerData()){
        cout << hex << "Manu: ";
        printf("%04x : ", manuData.CompanyId());

        for(size_t i = 0; i < manuData.Data().Length(); i++){
            printf("%02x", manuData.Data().data()[i]);
        }
        cout << endl;
    }
    cout << dec << "RSSI: " << device.RawSignalStrengthInDBm() << endl;
    cout << "-----------------------------------------" << endl;


};

void ConnectionManager::printBufferAsString(IBuffer const& buffer){
    DataReader reader = DataReader::FromBuffer(buffer);
    string result;
    result.reserve(buffer.Length());

    while(reader.UnconsumedBufferLength() > 0){
        char c = static_cast<char>(reader.ReadByte());
        result.push_back(c);
    }
    cout << "Value (string): " << result << endl;

}

bool ConnectionManager::isPheripheralNew(const BluetoothLEAdvertisementReceivedEventArgs& args){
    //Search already discovered devices
    return (discoveredDeviceUUIDS.empty() || !(std::find(discoveredDeviceUUIDS.begin(), discoveredDeviceUUIDS.end(), args.BluetoothAddress()) != discoveredDeviceUUIDS.end()));
};

bool ConnectionManager::shouldConnectToDevice(const BluetoothLEAdvertisementReceivedEventArgs& args){

    //Only connect to reliable signals
    if(args.RawSignalStrengthInDBm() < -75){
        return false;
    }

    //Ignore Apple devices Macs/Airtags/IPhones/IPads/Watches/etc
    for(auto const& mfg : args.Advertisement().ManufacturerData()){
        if(mfg.CompanyId() == 0x004C){
            return false;
        }
    }

    //Only connect if they have a service
    if(args.Advertisement().ServiceUuids().Size() == 0){
        return false;
    }

    return true;

}

bool ConnectionManager::isDesiredDevice(const IBuffer& value){
    auto data = value.data();
    size_t len = value.Length();

    //Need to assign characteristic values and put them here
    if(true){
        return true;
    }
    return false;

}