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

using namespace std;
using namespace winrt;
using namespace Windows::Storage::Streams;
using namespace Windows::Devices::Bluetooth;
using namespace Windows::Devices::Bluetooth::Advertisement;
using namespace Windows::Devices::Bluetooth::GenericAttributeProfile;

//-------------------------------------------------------------------------------------------------------------
//Public

ConnectionManager::ConnectionManager(){
    cout << "Creating connection manager" << endl;
};
//Implement later to handle properly
ConnectionManager::~ConnectionManager(){
    cout << "Connection manager deconstructor called [NEEDS TO BE IMPLEMENTED]" << endl;
};

string ConnectionManager::operator<<(const ConnectionManager& CM){
    cout << "Called connection manager to string [NEEDS TO BE IMPLEMENTED]" << endl;
    return " ";
};

//-------------------------------------------------------------------------------------------------------------
//Active connection management

/*-------------------------------------------------------------------------------------------------------------


-------------------------------------------------------------------------------------------------------------*/

void ConnectionManager::advertise(){
    init_apartment();

    //Create GATT
    auto result = GattServiceProvider::CreateAsync(SERVICE_UUID).get();

    if(result.Error() != BluetoothError::Success){
        cout << "Error setting up profile for BLE" << endl;
    }else{
        cout << "Success BLE GATT provider created successfully" << endl;
        wcout << L"Service Provider ID: " << to_hstring(result.ServiceProvider().Service().Uuid()) << endl;
    }

    ServerSide = true;
    static GattServiceProvider provider = result.ServiceProvider(); //For advertising persitently accross function calls and scopes

    //Writing characteristics for sending messages Client -> Server
    GattLocalCharacteristicParameters writeParams{};
    writeParams.CharacteristicProperties(GattCharacteristicProperties::Write |
        GattCharacteristicProperties::WriteWithoutResponse
    );
    
    //CHANGE THIS TO HAVE PROTECTED COMMUNICATION LATER
    writeParams.WriteProtectionLevel(
        GattProtectionLevel::Plain
    );
    writeParams.UserDescription(L"Client -> Server");

    auto writeResult = provider.Service().CreateCharacteristicAsync(CLIENT_TO_SERVER_CHAR_UUID, writeParams).get();

    if(writeResult.Error() != BluetoothError::Success){
        cout << "Failed to create write characteristic for client to server messages" << endl;
        return;
    }
    ServerWriteChar = writeResult.Characteristic();
    wcout << L"Server write characteristic for client to send messages to server ID: " << to_hstring(ServerWriteChar.Uuid()) << endl;

    //Creating the event handler for when client writes to server
    ServerWriteChar.WriteRequested([](GattLocalCharacteristic const& sender, GattWriteRequestedEventArgs const& args){

        auto defferal = args.GetDeferral(); //prevent event from completing before done reading
        try{
            auto request = args.GetRequestAsync().get();
            DataReader reader = DataReader::FromBuffer(request.Value());
            vector<uint8_t> buffer(reader.UnconsumedBufferLength());
            reader.ReadBytes(buffer);
            string msg(buffer.begin(), buffer.end());
            cout << "Received from client: " << msg << endl;
            try{
                request.Respond();
            }catch(...){
                cout << "Tried to respond but failed" << endl;
            }
        }catch(const hresult_error& ex){
            cout << "Error handling for client write: " << to_string(ex.message()) << endl;
        }catch(...){
            cout << "Unknown error handling write request" << endl;
        }
        defferal.Complete();

    });

    //Creating a charactersitic that notifies broadcaster when a client subscribes to it
    GattLocalCharacteristicParameters charParams{};
    charParams.CharacteristicProperties(GattCharacteristicProperties::Notify |
    GattCharacteristicProperties::Read);
    charParams.UserDescription(L"Server -> Client");

    auto notifyResult = provider.Service().CreateCharacteristicAsync(NOTIFY_CHAR_UUID, charParams).get();

    if(notifyResult.Error() != BluetoothError::Success){
        cout << "Failed to create characteristic where notified of client connection in order to pause broadcasting" << endl;
        return;
    }
    ServerNotifyChar = notifyResult.Characteristic();
    wcout << L"Server notify characteristic for when a client connects and subscribes ID: " << to_hstring(ServerNotifyChar.Uuid()) << endl;

    //Creating the event handler for client connect and disconnect charateristic
    ServerNotifyChar.SubscribedClientsChanged([this](GattLocalCharacteristic const& sender, Windows::Foundation::IInspectable const&){
        try{
            auto count = ServerNotifyChar.SubscribedClients().Size();
            cout << "Number of subscribed clients: " << count << endl;
            if(count > 0){
                cout << "Client has connected" << endl;
            }
        }catch(const hresult_error& ex){
            cout << "Error in SubscribedClientsChanged: " << to_string(ex.message()) << endl;
        }catch(...){
            cout << "Unknown error in SubscribedClientsChanged" << endl;
        }
    });

    GattServiceProviderAdvertisingParameters adv{};
    adv.IsConnectable(true);
    adv.IsDiscoverable(true);  // allows scanning

    //wait a bit to start advertising
    this_thread::sleep_for(200ms);

    provider.StartAdvertising(adv);
    cout << "Successfully started advertising" << endl;
};

/*-------------------------------------------------------------------------------------------------------------


-------------------------------------------------------------------------------------------------------------*/

void ConnectionManager::connect(const hstring deviceID){
    init_apartment();

    //Making CONNECTION_REQ packet to send to device
    try{
        auto device = BluetoothLEDevice::FromIdAsync(deviceID).get();

        //Check if device connection was successful
        if(!device){
            cout << "Failed to connect to device" << endl;
            return;
        }
        wcout << "Connected to device: " << device.Name().c_str() << endl;
        ServerSide = false;

        //wait a bit after first connecting
        this_thread::sleep_for(100ms);

        //Check if able to get services of device
        auto result = device.GetGattServicesAsync().get();
        if(result.Status() != GattCommunicationStatus::Success){
            cout << "Failed to get devices services" << endl;
            return;
        }

        //Search through the services in this attribute
        for(auto const& service : result.Services()){
            wcout << "Found service: " << winrt::to_hstring(service.Uuid()).c_str() << endl;

            try{
                //Get characteristics of a service
                auto charsResult = service.GetCharacteristicsAsync().get();
                if(charsResult.Status() == GattCommunicationStatus::Success){

                    //Search through these characteristics
                    for(auto const& ch : charsResult.Characteristics()){
                        wcout << "Characteristic UUID: " << winrt::to_hstring(ch.Uuid()).c_str() << endl;
                        
                        //Create template struct on type trait of properties
                        auto properties = ch.CharacteristicProperties();
                        using underlying = std::underlying_type_t<GattCharacteristicProperties>;

                        //Notify characteristic send messages from server to client
                        if((static_cast<underlying>(properties) & static_cast<underlying>(GattCharacteristicProperties::Notify)) != 0){
                            
                            ClientNotifyChar = ch;
                            cout << "Notify characteristic found for sending messages" << endl;
                            
                            ch.ValueChanged([](GattCharacteristic const&, GattValueChangedEventArgs const& args){
                                DataReader reader = DataReader::FromBuffer(args.CharacteristicValue());
                                vector<uint8_t> buffer(reader.UnconsumedBufferLength());
                                reader.ReadBytes(buffer);
                                string msg(buffer.begin(), buffer.end());
                                cout << "Received message: " << msg << endl;
                            });

                            //Enable the notifications
                            auto status = ch.WriteClientCharacteristicConfigurationDescriptorAsync(
                                GattClientCharacteristicConfigurationDescriptorValue::Notify
                            ).get();

                            if(status != GattCommunicationStatus::Success){
                                cout << "Failed to enable notify" << endl;
                            }
                        }

                        //Write characteristic for sending messages from client to server
                        if((static_cast<underlying>(properties) & static_cast<underlying>(GattCharacteristicProperties::WriteWithoutResponse))!= 0){

                            ClientWriteChar = ch;
                            cout << "Write characteristic found for sending messages" << endl;

                        }
                    }

                }else{
                    cout << "Error getting characteristics" << endl;
                }
            }catch(const hresult_error& ex){
                cout << "Error acquiring a characteristic may require authentication and encryption" << endl;
            }
        }

    }catch(const hresult_error& ex){
        cout << "Failed to connect to device (exception): " << to_string(ex.message()) << endl;
    }
};

/*-------------------------------------------------------------------------------------------------------------


-------------------------------------------------------------------------------------------------------------*/

void ConnectionManager::sendMessage(const string message){
    DataWriter writer;
    writer.WriteBytes(vector<uint8_t>(message.begin(), message.end()));

    if(ServerSide){
        if(!ServerNotifyChar){
            cout << "No notify characteristic" << endl;
            return;
        }

        if(ServerNotifyChar.SubscribedClients().Size() == 0){
            cout << "No clients are connected" << endl;
            return;
        }

        for(auto client : ServerNotifyChar.SubscribedClients()){
            ServerNotifyChar.NotifyValueAsync(writer.DetachBuffer(), client);
        }
    }else{  
        if(!ClientWriteChar){
            cout << "No write characteristic" << endl;
            return;
        } 

        //Create thread to send to avoid deadlock waiting for server to get message
        thread([message = message, writer = writer, charToWrite = ClientWriteChar](){
            try{
                auto status = charToWrite.WriteValueAsync(writer.DetachBuffer()).get();

                if(status == GattCommunicationStatus::Success){
                    cout << "Sent message: " << message << endl;
                }else{
                    cout << "Failed to send message" << endl;
                }
            }catch(const hresult_error& ex){
                cout << "Exception when sending message " << to_string(ex.message()) << endl;
            }

        }).detach();

    }
};

//-------------------------------------------------------------------------------------------------------------
//Buffer and reconnection management

/*-------------------------------------------------------------------------------------------------------------


-------------------------------------------------------------------------------------------------------------*/

void ConnectionManager::listDevices(){

    cout << "Scanning for devices for 3 seconds" << endl;

    init_apartment();

    BluetoothLEAdvertisementWatcher watcher;

    watcher.Received([](BluetoothLEAdvertisementWatcher const&, BluetoothLEAdvertisementReceivedEventArgs const& args){
        std::wstring name = args.Advertisement().LocalName().c_str();
        if (!name.empty()) {
            std::wcout << L"Found device: " << name << L"\nAddress: " << std::hex << args.BluetoothAddress() << std::endl;
        }
    });

    watcher.ScanningMode(BluetoothLEScanningMode::Active);
    watcher.Start();

    this_thread::sleep_for(3s);

    watcher.Stop();

    cout << "Done listening" << endl;
};

//-------------------------------------------------------------------------------------------------------------
//Getters and setters

//Get Bluetooth address of your device
uint64_t ConnectionManager::getBluetoothAddress() const{
    try{
        init_apartment();

        auto adapter = BluetoothAdapter::GetDefaultAsync().get();
        uint64_t address = adapter.BluetoothAddress();

        return address;
    }catch(...){
        cout << "Issue getting local device's Bluetooth address" << endl;
        return 0;
    }
};
//Get name of your device
wstring ConnectionManager::getDeviceName() const{
    wchar_t name[MAX_COMPUTERNAME_LENGTH + 1];
    DWORD size = MAX_COMPUTERNAME_LENGTH + 1;

    if(GetComputerNameW(name, &size)){
        return wstring(name);
    }else{
        cout << "Issue getting local device's name" << endl;
        return L"";
    }
};
