# Top-level ESP-IDF project file.
# Build:  idf.py set-target esp32 && idf.py build
# Run:    idf.py qemu monitor      (CPU-only emulation; no real peripherals/WiFi)
cmake_minimum_required(VERSION 3.16)

# This is an ESP-IDF project: it must be configured by idf.py / the ESP-IDF
# extension (both set IDF_PATH), NOT the generic CMake Tools extension. If a tool
# probes this file without IDF_PATH set, configure a harmless stub instead of
# failing on the missing ESP-IDF include — keeps CMake Tools from spamming errors.
if(NOT DEFINED ENV{IDF_PATH})
  message(WARNING
    "IDF_PATH not set — skipping ESP-IDF configuration. "
    "Build with `idf.py build` or the ESP-IDF extension, not CMake Tools.")
  project(smart_park_stub NONE)
  return()
endif()

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(smart_park)
