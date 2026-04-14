#include "ConnectionManager.h"
#include <chrono>
#include <cctype>

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

namespace {
const std::string kTransparentTxUuid = "49535343-1e4d-4bd9-ba61-23c647249616";
const std::string kTransparentRxUuid = "49535343-8841-43e4-a8d4-fcbe34729bb3";
const std::string kTransparentCtrlUuid = "49535343-4c8a-39b3-2f49-511cff073b7e";
const std::vector<uint8_t> kControlEnablePayload = {0x01};

std::string toLowerCopy(std::string s){
    std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c){ return static_cast<char>(std::tolower(c)); });
    return s;
}
}

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

    // Start background consumer that drains the internal message queue and
    // writes characteristic values to stdout. This decouples BLE callbacks
    // from I/O, following a producer–consumer (message queue) pattern.
    sampleConsumerThread = std::thread([this]() {
        this->consumeSampleQueue();
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

void ConnectionManager::connectToDeviceWithAddress(uint64_t deviceAddress){
    cout << hex << "Connect to explicit address: " << deviceAddress << endl;
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
        const auto addr = characteristic.Service().Device().BluetoothAddress();
        const auto charUuid = characteristic.Uuid();
        const std::string uuid = toLowerCopy(this->winrtGuidToString(charUuid));
        const uint32_t propMask = static_cast<uint32_t>(properties);
        const bool hasNotify = (propMask & static_cast<uint32_t>(GattCharacteristicProperties::Notify)) != 0;
        const bool hasWrite = (propMask & static_cast<uint32_t>(GattCharacteristicProperties::Write)) != 0;
        const bool hasWriteNoRsp = (propMask & static_cast<uint32_t>(GattCharacteristicProperties::WriteWithoutResponse)) != 0;

        if(uuid == kTransparentTxUuid){
            cout << "[BM71] Transparent TX discovered (uuid=" << uuid << ", notify=" << (hasNotify ? "yes" : "no") << ")" << endl;
            transparentTxNotifyCharacteristics[addr] = characteristicPtr;
            if(!hasNotify){
                cout << "[BM71] ERROR: Transparent TX missing Notify property." << endl;
                continue;
            }
            if(subscribedNotifyCharacteristics[addr].find(charUuid) != subscribedNotifyCharacteristics[addr].end()){
                continue;
            }

            // Attach ValueChanged BEFORE CCCD write to avoid races on early packets.
            characteristicPtr->ValueChanged([this](GattCharacteristic sender, GattValueChangedEventArgs args){
                auto value = args.CharacteristicValue();
                const uint64_t deviceAddress = sender.Service().Device().BluetoothAddress();
                std::string hexPayload;
                hexPayload.reserve(value.Length() * 2);
                std::string asciiPayload;
                asciiPayload.reserve(value.Length());

                for(size_t i = 0; i < value.Length(); i++){
                    char buf[3];
                    std::snprintf(buf, sizeof(buf), "%02x", value.data()[i]);
                    hexPayload.append(buf);
                    asciiPayload.push_back(static_cast<char>(value.data()[i]));
                }

                notifyEventCount.fetch_add(1);
                sampleQueue.enqueue(hexPayload);
                cout << "[BM71] ValueChanged TX notify len=" << value.Length() << " hex_preview=" << hexPayload.substr(0, 40) << endl;
                processTransparentChunk(deviceAddress, asciiPayload);
            });

            characteristicPtr->WriteClientCharacteristicConfigurationDescriptorAsync(
                GattClientCharacteristicConfigurationDescriptorValue::Notify
            ).Completed([this, characteristicPtr, addr](IAsyncOperation<GattCommunicationStatus> op, AsyncStatus status){
                if(status != AsyncStatus::Completed){
                    cout << "[BM71] ERROR: TX CCCD write async status=" << static_cast<int>(status) << endl;
                    return;
                }
                auto ccStatus = op.GetResults();
                if(ccStatus != GattCommunicationStatus::Success){
                    cout << "[BM71] ERROR: TX CCCD write failed, gatt_status=" << static_cast<int>(ccStatus) << " (ProtocolError likely if permissions mismatch)" << endl;
                    return;
                }
                subscribedNotifyCharacteristics[addr].insert(characteristicPtr->Uuid());
                txNotifySubscribed.store(true);
                cout << "[BM71] subscribed TX notify OK (CCCD=0x0001)" << endl;
                writeControlPointEnable(addr);

                std::thread([this](){
                    const uint64_t startCount = notifyEventCount.load();
                    std::this_thread::sleep_for(std::chrono::seconds(5));
                    if(txNotifySubscribed.load() && notifyEventCount.load() == startCount){
                        cout << "[BM71] WARNING: no TX notifications received within 5s of subscribe." << endl;
                    }
                }).detach();
            });
            continue;
        }

        if(uuid == kTransparentRxUuid){
            cout << "[BM71] Transparent RX discovered (uuid=" << uuid << ", write=" << (hasWrite ? "yes" : "no")
                 << ", writeNoRsp=" << (hasWriteNoRsp ? "yes" : "no") << ")" << endl;
            if(hasWrite || hasWriteNoRsp){
                subscribedWriteCharacteristics[addr] = characteristicPtr;
            }else{
                cout << "[BM71] ERROR: Transparent RX has no writable property." << endl;
            }
            continue;
        }

        if(uuid == kTransparentCtrlUuid){
            cout << "[BM71] Transparent Control discovered (uuid=" << uuid << ")" << endl;
            transparentControlCharacteristics[addr] = characteristicPtr;
            continue;
        }

    }
};

void ConnectionManager::sendMessage(uint64_t deviceAddress, const string& message){
    auto ch = subscribedWriteCharacteristics.find(deviceAddress);
    if(ch == subscribedWriteCharacteristics.end()){
        cout << "[BM71] No Transparent RX write characteristic stored for device: " << BluetoothAddressToString(deviceAddress) << endl;
        return;
    }

    auto& characteristic = ch->second; //get actual value stored at index
    if(!characteristic){
        cout << "Write characteristic pointer is null" << endl;
    }

    DataWriter writer;
    writer.WriteBytes(vector<uint8_t>(message.begin(), message.end()));
    auto buffer = writer.DetachBuffer();

    auto props = static_cast<uint32_t>(characteristic->CharacteristicProperties());
    const bool supportsWriteNoRsp = (props & static_cast<uint32_t>(GattCharacteristicProperties::WriteWithoutResponse)) != 0;
    const GattWriteOption writeOpt = supportsWriteNoRsp ? GattWriteOption::WriteWithoutResponse : GattWriteOption::WriteWithResponse;
    cout << "[BM71] TX outbound -> Transparent RX using " << (supportsWriteNoRsp ? "WriteWithoutResponse" : "WriteWithResponse") << endl;

    characteristic->WriteValueAsync(buffer, writeOpt).Completed(
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

void ConnectionManager::writeControlPointEnable(uint64_t deviceAddress){
    auto it = transparentControlCharacteristics.find(deviceAddress);
    if(it == transparentControlCharacteristics.end() || !it->second){
        cout << "[BM71] Control-point characteristic not found; skipping optional transparent-enable write." << endl;
        return;
    }

    DataWriter writer;
    writer.WriteBytes(kControlEnablePayload);
    auto buffer = writer.DetachBuffer();
    auto controlChar = it->second;
    cout << "[BM71] Writing control-point enable payload (len=" << kControlEnablePayload.size() << ")." << endl;
    controlChar->WriteValueAsync(buffer, GattWriteOption::WriteWithoutResponse).Completed(
        [](IAsyncOperation<GattCommunicationStatus> op, AsyncStatus status){
            if(status != AsyncStatus::Completed){
                cout << "[BM71] Control-point write async status=" << static_cast<int>(status) << endl;
                return;
            }
            auto gattStatus = op.GetResults();
            if(gattStatus == GattCommunicationStatus::Success){
                cout << "[BM71] Control-point write success." << endl;
            }else{
                cout << "[BM71] Control-point write failed, gatt_status=" << static_cast<int>(gattStatus) << endl;
            }
        }
    );
}

void ConnectionManager::processTransparentChunk(uint64_t deviceAddress, const std::string& chunk){
    std::string& aggregate = transparentReassemblyBuffer[deviceAddress];
    aggregate.append(chunk);

    // Support framed chunks: "SEQ:<n>,LEN:<m>|<payload...>"
    size_t pipePos = aggregate.find('|');
    if(pipePos == std::string::npos){
        return;
    }

    const std::string header = aggregate.substr(0, pipePos);
    const size_t seqPos = header.find("SEQ:");
    const size_t lenPos = header.find("LEN:");
    if(seqPos == std::string::npos || lenPos == std::string::npos){
        if(aggregate.size() > 512){
            aggregate.clear();
        }
        return;
    }

    const size_t commaPos = header.find(',', seqPos);
    if(commaPos == std::string::npos || lenPos < commaPos){
        return;
    }

    int seq = -1;
    int len = -1;
    try{
        seq = std::stoi(header.substr(seqPos + 4, commaPos - (seqPos + 4)));
        len = std::stoi(header.substr(lenPos + 4));
    }catch(...){
        return;
    }

    if(len < 0){
        return;
    }

    if(aggregate.size() < pipePos + 1 + static_cast<size_t>(len)){
        return;
    }

    const std::string payload = aggregate.substr(pipePos + 1, static_cast<size_t>(len));
    cout << "[BM71] Reassembled framed payload seq=" << seq << " len=" << len << endl;
    aggregate.erase(0, pipePos + 1 + static_cast<size_t>(len));
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

void ConnectionManager::connectPeripheral(uint64_t windowsDeviceAddress, int retriesRemaining){
    BluetoothLEDevice::FromBluetoothAddressAsync(windowsDeviceAddress).Completed([this, windowsDeviceAddress, retriesRemaining](IAsyncOperation<BluetoothLEDevice> sender, AsyncStatus status){
        auto device = sender.GetResults();
        if(device){
            switch(status){
                case AsyncStatus::Completed:
                    this->didConnect(device);
                    break;
                case AsyncStatus::Canceled:
                case AsyncStatus::Error:
                case AsyncStatus::Started:
                    if(retriesRemaining > 0){
                        std::this_thread::sleep_for(std::chrono::milliseconds(250));
                        this->connectPeripheral(windowsDeviceAddress, retriesRemaining - 1);
                    }else{
                        this->didFailToConnect();
                    }
            }
        }else{
            if(retriesRemaining > 0){
                std::this_thread::sleep_for(std::chrono::milliseconds(250));
                this->connectPeripheral(windowsDeviceAddress, retriesRemaining - 1);
            }else{
                cout << "Device is Null: " << sender.ErrorCode() << endl;
                this->didFailToConnect();
            }
        }
    });
};

void ConnectionManager::discoverServices(BluetoothLEDevice device, int retriesRemaining){
    device.GetGattServicesAsync(BluetoothCacheMode::Uncached).Completed([this, device, retriesRemaining](IAsyncOperation<GattDeviceServicesResult> sender, AsyncStatus status){
        GattDeviceServicesResult result = sender.get();
        if(result){
            switch(status){
                case AsyncStatus::Completed:
                    if(result.Status() == GattCommunicationStatus::Success){
                        this->didDiscoverServices(result.Services(), result.Status());
                    }else if(retriesRemaining > 0){
                        std::this_thread::sleep_for(std::chrono::milliseconds(350));
                        this->discoverServices(device, retriesRemaining - 1);
                    }else{
                        this->didDiscoverServices(result.Services(), result.Status());
                    }
                    break;
                case AsyncStatus::Canceled:
                case AsyncStatus::Error:
                case AsyncStatus::Started:
                    if(retriesRemaining > 0){
                        std::this_thread::sleep_for(std::chrono::milliseconds(350));
                        this->discoverServices(device, retriesRemaining - 1);
                    }else{
                        this->didFailToDiscoverServices();
                    }
            }
        }else{
            if(retriesRemaining > 0){
                std::this_thread::sleep_for(std::chrono::milliseconds(350));
                this->discoverServices(device, retriesRemaining - 1);
            }else{
                cout << "Services are empty" << endl;
                this->didFailToDiscoverServices();
            }
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
    txNotifySubscribed.store(false);
    notifyEventCount.store(0);
    transparentReassemblyBuffer[device.BluetoothAddress()].clear();
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
            const auto uuid = toLowerCopy(this->winrtGuidToString(characteristic.Uuid()));
            const uint32_t propMask = static_cast<uint32_t>(characteristic.CharacteristicProperties());
            cout << "[BM71] Characteristic discovered uuid=" << uuid
                 << " props(read=" << ((propMask & static_cast<uint32_t>(GattCharacteristicProperties::Read)) ? "1" : "0")
                 << ",write=" << ((propMask & static_cast<uint32_t>(GattCharacteristicProperties::Write)) ? "1" : "0")
                 << ",writeNoRsp=" << ((propMask & static_cast<uint32_t>(GattCharacteristicProperties::WriteWithoutResponse)) ? "1" : "0")
                 << ",notify=" << ((propMask & static_cast<uint32_t>(GattCharacteristicProperties::Notify)) ? "1" : "0")
                 << ")" << endl;

            if(propMask & static_cast<uint32_t>(GattCharacteristicProperties::Read)){
                readValueForCharacteristic(characteristic);
            }
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
        // Build hex payload for the message queue (one message per notification)
        std::string hexPayload;
        hexPayload.reserve(value.Length() * 2);
        for(size_t i = 0; i < value.Length(); i++){
            char buf[3];
            std::snprintf(buf, sizeof(buf), "%02x", value.data()[i]);
            hexPayload.append(buf);
        }
        // Enqueue for the background consumer to print as a log line.
        sampleQueue.enqueue(hexPayload);

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
    constexpr uint64_t kTargetMac = 0x2CFE8BD79AF6ull; // 2C:FE:8B:D7:9A:F6
    constexpr const char* kTargetName = "BM71_BLE";

    // Hard lock auto-connect to one device MAC.
    if(args.BluetoothAddress() != kTargetMac){
        return false;
    }

    // If the advertiser includes LocalName, it must match BM71_BLE.
    std::string localName = to_string(args.Advertisement().LocalName().c_str());
    if(!localName.empty() && localName != kTargetName){
        return false;
    }

    //Only connect to reliable signals
    if(args.RawSignalStrengthInDBm() < -90){
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

void ConnectionManager::consumeSampleQueue(){
    while (true) {
        // Blocks until a new hex payload is available
        std::string hexPayload = sampleQueue.dequeue();
        cout << "Value (02x hex): " << hexPayload << endl;
    }
}