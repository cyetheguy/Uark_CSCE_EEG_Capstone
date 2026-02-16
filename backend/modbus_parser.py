"""Parse RDF/N-Triples Modbus data (moved from frontend for parser migration)."""

import re
from datetime import datetime
from typing import List, Dict, Any, Optional

def parse_modbus_data(content: str) -> List[Dict[str, Any]]:
    modbus_data: List[Dict[str, Any]] = []

    try:
        clean_content = re.sub(r'@prefix[^.]*\.\s*', '', content)
        entries = [e.strip() for e in re.split(r'(?=<https://[^>]+>)', clean_content) if e.strip()]

        print(f"[modbus_parser] Found {len(entries)} entries after cleaning")

        for entry in entries:
            if not entry.strip():
                continue

            try:
                triples = [t.strip() for t in entry.split(';') if t.strip()]

                value: Optional[int] = None
                register: Optional[int] = None
                func: str = 'Potentiometer1'
                type_str: str = 'Uint16'
                accessed: Optional[int] = None
                func_code: str = ''

                for triple in triples:
                    if 'ns1:value' in triple:
                        value_match = re.search(r'ns1:value\s+(\d+)\s*\.?', triple)
                        if value_match:
                            value = int(value_match.group(1))
                    elif 'ns1:register' in triple:
                        register_match = re.search(r'ns1:register\s+(\d+)', triple)
                        if register_match:
                            register = int(register_match.group(1))
                    elif 'ns1:function' in triple:
                        func_match = re.search(r'ns1:function\s+"([^"]+)"', triple)
                        if func_match:
                            func = func_match.group(1)
                    elif 'ns1:type' in triple:
                        type_match = re.search(r'ns1:type\s+"([^"]+)"', triple)
                        if type_match:
                            type_str = type_match.group(1)
                    elif 'ns1:accessed' in triple:
                        accessed_match = re.search(r'ns1:accessed\s+(\d+)', triple)
                        if accessed_match:
                            accessed = int(accessed_match.group(1))
                    elif 'ns1:func_code' in triple:
                        func_code_match = re.search(r'ns1:func_code\s+"([^"]+)"', triple)
                        if func_code_match:
                            func_code = func_code_match.group(1)

                print(f"[modbus_parser] Parsed entry: value={value}, register={register}, func={func}, accessed={accessed}")

                if value is not None and register is not None and accessed is not None:
                    timestamp_dt = datetime.fromtimestamp(accessed)
                    timestamp_iso = timestamp_dt.isoformat() + 'Z'

                    modbus_entry: Dict[str, Any] = {
                        "dataType": "modbus",
                        "value": value,
                        "timestamp": timestamp_iso,
                        "register": register,
                        "function": func,
                        "accessed": accessed,
                        "deviceId": "esp-device",
                        "source": "solid-pod"
                    }

                    modbus_data.append(modbus_entry)
                else:
                    print(f"[modbus_parser] WARNING: Incomplete entry - value={value}, register={register}, accessed={accessed}")

            except Exception as entry_error:
                print(f"[modbus_parser] ERROR parsing entry: {entry_error}")
                continue

    except Exception as error:
        print(f"[modbus_parser] ERROR parsing modbus data: {error}")
        import traceback
        traceback.print_exc()

    print(f"[modbus_parser] Final modbus data count: {len(modbus_data)}")
    return modbus_data
