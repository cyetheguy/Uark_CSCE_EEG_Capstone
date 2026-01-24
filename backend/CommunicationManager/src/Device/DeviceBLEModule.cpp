#include "DeviceBLEModule.h"

//Bluetooth naming
using winrt::Windows::Devices::Bluetooth::BluetoothConnectionStatus;
using winrt::Windows::Devices::Bluetooth::BluetoothLEDevice;
using winrt::Windows::Devices::Bluetooth::BluetoothError;

using winrt::Windows::Devices::Bluetooth::Advertisement::BluetoothLEAdvertisement;
using winrt::Windows::Devices::Bluetooth::Advertisement::BluetoothLEAdvertisementReceivedEventArgs;
using winrt::Windows::Devices::Bluetooth::Advertisement::BluetoothLEAdvertisementWatcher;
using winrt::Windows::Devices::Bluetooth::Advertisement::BluetoothLEAdvertisementWatcherStoppedEventArgs;
using winrt::Windows::Devices::Bluetooth::Advertisement::BluetoothLEManufacturerData;

//MIGHT NOT NEED THIS
using winrt::Windows::Devices::Bluetooth::BluetoothCacheMode;

//Gatt interface naming
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattSession;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattReadResult;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattServiceProviderAdvertisingParameters;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattLocalCharacteristicParameters;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattWriteRequestedEventArgs;

using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattCharacteristic;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattLocalCharacteristic;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattCharacteristicProperties;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattCharacteristicsResult;

using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattCommunicationStatus;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattClientCharacteristicConfigurationDescriptorValue;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattValueChangedEventArgs;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattProtectionLevel;

using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattDeviceService;
using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattDeviceServicesResult;

using winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattWriteOption;

//Async
using winrt::Windows::Foundation::IAsyncOperation;
using winrt::Windows::Foundation::AsyncStatus;

//Helpers
using winrt::Windows::Storage::Streams::DataWriter;
using winrt::Windows::Storage::Streams::IBuffer;
using winrt::Windows::Foundation::Collections::IVectorView;

using std::hex;
using std::dec;
using std::cout;
using std::endl;
using std::span;
using std::string;
using std::vector;
using std::make_shared;
using std::runtime_error;
using winrt::to_string;

DeviceBLEModule::DeviceBLEModule(){
    InitializeGatt();
};

DeviceBLEModule::~DeviceBLEModule(){
    
};

void DeviceBLEModule::Start(){
    GattServiceProviderAdvertisingParameters advParams;
    advParams.IsConnectable(true);
    advParams.IsDiscoverable(true);

    provider.StartAdvertising(advParams);
};

void DeviceBLEModule::Stop(){
    provider.StopAdvertising();
};

void DeviceBLEModule::plainSendMessage(span<const uint8_t> data){
    DataWriter writer;
    writer.WriteBytes(data);
    this->plainMessageChar.NotifyValueAsync(writer.DetachBuffer());
}

void DeviceBLEModule::InitializeGatt(){

    //Create service
    guid serviceUuid("E3F12A4B-7C9D-4D2F-AF89-5B3E6C1D2A7F");
    auto serviceResult = provider.CreateAsync(serviceUuid.ToWinRTGuid()).get();

    if(serviceResult.Error() != BluetoothError::Success){
        runtime_error("Failed to create GATT servcie");
    }

    provider = serviceResult.ServiceProvider();
    
    //Characteristic
    GattLocalCharacteristicParameters params;
    params.CharacteristicProperties(
        GattCharacteristicProperties::Write |
        GattCharacteristicProperties::Notify
    );
    params.WriteProtectionLevel(GattProtectionLevel::Plain);
    params.UserDescription(L"Plaintext Messanger");

    guid charUuid("A1B2C3D4-5E6F-7890-1234-56789ABCDEF0");
    auto charResult = provider.Service().CreateCharacteristicAsync(charUuid.ToWinRTGuid(), params).get();

    plainMessageChar = charResult.Characteristic();

    plainMessageChar.WriteRequested([](auto const&, GattWriteRequestedEventArgs const& args){

        auto defferal = args.GetDeferral();
        auto request = args.GetRequestAsync().get();

        auto reader = DataReader::FromBuffer(request.Value());
        vector<uint_8> msg(reader.UncomsumedBufferLenght());
        reader.ReadBytes(msg);

        printf("Received message: ");
        for(aut b: msg){
            printf("%02x", b)
        }
        printf("\n");

        request.Respond();
        defferal.Complete();

    });

    //A1B2C3D4-5E6F-7890-1234-56789ABCDEF0

};