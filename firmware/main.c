#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <inttypes.h>
#include <stdbool.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/uart.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "sleep_demo_data.h"

// --- Hardware Definitions ---
#define BM71_UART_TX_GPIO GPIO_NUM_9   // ESP32 TX -> BM71 RX 
#define BM71_UART_RX_GPIO GPIO_NUM_8   // ESP32 RX <- BM71 TX 
#define BM71_MODE_GPIO    GPIO_NUM_7   // ESP32 GPIO7 -> BM71 MODE
#define BM71_UART_BAUD    115200

#define BM71_UART_PORT    UART_NUM_1
#define BUF_SIZE          1024
#define BM71_BOOT_DELAY_MS 1500
#define TX_PERIOD_MS      4
#define UART_SAFE_CHUNK_BYTES 20
#define STATS_PERIOD_MS   5000

/** Frame sync byte. Wire format: [0xEE][raw_lo][raw_hi] — int16 LE microvolts, 250 SPS. */
#define BRAINWAVE_FRAME_MAGIC (0xEEu)
#define TX_PERIOD_TICKS   ((TickType_t)((pdMS_TO_TICKS(TX_PERIOD_MS) > 0U) ? pdMS_TO_TICKS(TX_PERIOD_MS) : 1U))

static const char *TAG = "BM71_BLE_APP";
static uint8_t rx_data[BUF_SIZE];
static size_t demo_ring_offset;
static bool cccd_enabled = true;  // Proxy state on bridge side; BM71 owns real CCCD.
static uint32_t notify_sent_count = 0;
static uint32_t notify_drop_count = 0;
static uint32_t queue_overflow_count = 0;
static uint32_t bytes_sent_total = 0;

static void log_tx_stats(void) {
    ESP_LOGI(TAG,
             "TX stats: cccd_enabled=%d notify_sent_count=%" PRIu32
             " notify_drop_count=%" PRIu32
             " queue_overflow_count=%" PRIu32
             " bytes_sent_total=%" PRIu32,
             cccd_enabled ? 1 : 0,
             notify_sent_count,
             notify_drop_count,
             queue_overflow_count,
             bytes_sent_total
            );
}

static void process_rx_control(const uint8_t *data, int len) {
    // Optional bridge control hooks (helps test state transitions from host writes):
    // "CCCD=1" -> enable, "CCCD=0" -> disable.
    if (len <= 0) {
        return;
    }
    if (strstr((const char *)data, "CCCD=1") != NULL) {
        if (!cccd_enabled) {
            cccd_enabled = true;
            ESP_LOGI(TAG, "cccd_enabled transition: 0 -> 1");
        }
    } else if (strstr((const char *)data, "CCCD=0") != NULL) {
        if (cccd_enabled) {
            cccd_enabled = false;
            ESP_LOGI(TAG, "cccd_enabled transition: 1 -> 0");
        }
    }
}

/** UART -> BM71 -> BLE: send raw bytes in small chunks (one byte is one notify-sized payload). */
static void send_chunked_uart_payload(const char *payload, size_t payload_len) {
    size_t offset = 0;
    while (offset < payload_len) {
        size_t chunk_len = payload_len - offset;
        if (chunk_len > UART_SAFE_CHUNK_BYTES) {
            chunk_len = UART_SAFE_CHUNK_BYTES;
        }

        int written = uart_write_bytes(BM71_UART_PORT, payload + offset, chunk_len);
        if (written < 0) {
            notify_drop_count++;
            queue_overflow_count++;
            break;
        }
        if ((size_t)written < chunk_len) {
            notify_drop_count++;
            queue_overflow_count++;
            bytes_sent_total += (uint32_t)written;
            break;
        }

        notify_sent_count++;
        bytes_sent_total += (uint32_t)written;
        offset += chunk_len;
    }
}

void app_main(void) {
    _Static_assert(SLEEP_DEMO_SAMPLE_COUNT >= 1, "Preload must contain at least one sleep demo sample.");

    ESP_LOGI(TAG, "Configuring BM71 for Application Mode (MODE=1).");

    // Set MODE high so BM71 will boot into Application Mode.
    // Note: BM71 typically samples MODE at reset/power-on. You said you'll power-cycle after flashing.
    gpio_reset_pin(BM71_MODE_GPIO);
    gpio_set_direction(BM71_MODE_GPIO, GPIO_MODE_OUTPUT);
    gpio_set_level(BM71_MODE_GPIO, 1);
    
    // Give BM71 time to boot after power-cycle/reset.
    vTaskDelay(pdMS_TO_TICKS(BM71_BOOT_DELAY_MS));
    ESP_LOGI(TAG, "BM71 advertising/link behavior depends on its firmware/config (not UART writes).");

    // Configure ESP32 UART to talk to the BM71
    uart_config_t uart_config = {
        .baud_rate = BM71_UART_BAUD,
        .data_bits = UART_DATA_8_BITS,
        .parity    = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };

    ESP_ERROR_CHECK(uart_param_config(BM71_UART_PORT, &uart_config));
    ESP_ERROR_CHECK(uart_set_pin(BM71_UART_PORT, BM71_UART_TX_GPIO, BM71_UART_RX_GPIO, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));
    ESP_ERROR_CHECK(uart_driver_install(BM71_UART_PORT, BUF_SIZE * 2, 0, 0, NULL, 0));

    // Offline demo: one sample per TX_PERIOD_MS from sleep_demo_data.h, ring buffer.
    // Wire format: [0xEE][raw_lo][raw_hi] — int16 LE microvolts at 250 SPS.
    ESP_LOGI(TAG,
             "Sleep demo preload: file=%s ch=%s count=%d (TX magic+int16LE / %d ms over UART->BM71)",
             SLEEP_DEMO_SOURCE_FILE,
             SLEEP_DEMO_CHANNEL_LABEL,
             (int)SLEEP_DEMO_SAMPLE_COUNT,
             TX_PERIOD_MS);
    demo_ring_offset = 0;

    TickType_t last_tx = xTaskGetTickCount();
    TickType_t last_stats = xTaskGetTickCount();
    while (1) {
        TickType_t now = xTaskGetTickCount();
        if ((now - last_tx) >= TX_PERIOD_TICKS) {
            if (cccd_enabled) {
                int16_t sample =
                    (int16_t)sleep_demo_samples[demo_ring_offset % (size_t)SLEEP_DEMO_SAMPLE_COUNT];
                uint8_t frame[3] = {
                    BRAINWAVE_FRAME_MAGIC,
                    (uint8_t)(sample & 0xFF),
                    (uint8_t)((sample >> 8) & 0xFF)
                };
                send_chunked_uart_payload((const char *)frame, sizeof(frame));
                demo_ring_offset = (demo_ring_offset + 1) % (size_t)SLEEP_DEMO_SAMPLE_COUNT;
            } else {
                notify_drop_count++;
            }
            last_tx = now;
        }

        if ((now - last_stats) >= pdMS_TO_TICKS(STATS_PERIOD_MS)) {
            log_tx_stats();
            last_stats = now;
        }

        int len = uart_read_bytes(BM71_UART_PORT, rx_data, BUF_SIZE - 1, 100 / portTICK_PERIOD_MS);
        if (len > 0) {
            process_rx_control(rx_data, len);
            // Avoid %s on binary UART data (nulls / non-ASCII); log length + hex preview only.
            const int preview = (len > 16) ? 16 : len;
            char hexbuf[16 * 3 + 1];
            int p = 0;
            for (int i = 0; i < preview && p < (int)sizeof(hexbuf) - 3; i++) {
                int n = snprintf(hexbuf + p, sizeof(hexbuf) - (size_t)p, "%02x", (unsigned)rx_data[i]);
                if (n <= 0) {
                    break;
                }
                p += n;
            }
            hexbuf[p] = '\0';
            ESP_LOGI(TAG, "BM71->ESP32 len=%d hex_preview=%s%s", len, hexbuf,
                     (len > preview) ? "..." : "");
        }
    }
}