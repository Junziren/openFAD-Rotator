cmake_minimum_required(VERSION 3.24)

project(openFADRotator VERSION 0.1.0 LANGUAGES CXX)

include(CTest)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(JUCE_PATH "" CACHE PATH "Path to a JUCE checkout (9.0.1 preferred)")
if (JUCE_PATH STREQUAL "" AND DEFINED ENV{JUCE_PATH})
    set(JUCE_PATH "$ENV{JUCE_PATH}")
endif()
if (JUCE_PATH STREQUAL "")
    set(JUCE_PATH "${CMAKE_CURRENT_LIST_DIR}/../JUCE")
endif()

if (NOT EXISTS "${JUCE_PATH}/CMakeLists.txt")
    message(FATAL_ERROR "JUCE_PATH must point at a JUCE checkout. Got: ${JUCE_PATH}")
endif()

add_subdirectory("${JUCE_PATH}" JUCE EXCLUDE_FROM_ALL)

set(WEB_DIST "${CMAKE_CURRENT_LIST_DIR}/WebUI/dist")
file(GLOB_RECURSE WEB_ASSETS CONFIGURE_DEPENDS
    "${WEB_DIST}/*"
)
if (NOT WEB_ASSETS)
    message(FATAL_ERROR "WebUI/dist is empty. Run 'npm run build' in WebUI before configuring.")
endif()

list(APPEND WEB_ASSETS "${CMAKE_CURRENT_LIST_DIR}/Resources/Speakers/profiles.json")

juce_add_binary_data(OpenFADRotatorWebData
    NAMESPACE OpenFADWeb
    SOURCES ${WEB_ASSETS}
)

if (APPLE)
    set(OPENFAD_PLUGIN_FORMATS VST3 AUv3 Standalone)
else()
    set(OPENFAD_PLUGIN_FORMATS VST3 Standalone)
endif()

juce_add_plugin(openFADRotator
    COMPANY_NAME "Unpure Bloom"
    BUNDLE_ID "org.openfad.rotator"
    PLUGIN_MANUFACTURER_CODE OFad
    PLUGIN_CODE ORot
    FORMATS ${OPENFAD_PLUGIN_FORMATS}
    PRODUCT_NAME "openFAD Rotator"
    DESCRIPTION "A low-poly acoustic rotation effect with speaker models and dream diffusion"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    COPY_PLUGIN_AFTER_BUILD FALSE
    NEEDS_WEBVIEW2 TRUE
)

target_sources(openFADRotator PRIVATE
    Source/Parameters.h
    Source/Parameters.cpp
    Source/RotatorDSP.h
    Source/RotatorDSP.cpp
    Source/PluginProcessor.h
    Source/PluginProcessor.cpp
    Source/PluginEditor.h
    Source/PluginEditor.cpp
)

target_link_libraries(openFADRotator PRIVATE
    OpenFADRotatorWebData
    juce::juce_audio_utils
    juce::juce_dsp
    juce::juce_gui_extra
)

if (TARGET juce::juce_webview2)
    target_link_libraries(openFADRotator PRIVATE juce::juce_webview2)
endif()

target_compile_definitions(openFADRotator PRIVATE
    JUCE_WEB_BROWSER=1
    JUCE_VST3_CAN_REPLACE_VST2=0
)

if (WIN32)
    target_compile_definitions(openFADRotator PRIVATE JUCE_USE_WIN_WEBVIEW2=1)
else()
    target_compile_definitions(openFADRotator PRIVATE JUCE_USE_WIN_WEBVIEW2=0)
endif()

if (WIN32)
    set(OPENFAD_WEBVIEW2_LOADER
        "${CMAKE_CURRENT_LIST_DIR}/Resources/WebView2/WebView2Loader.dll"
        CACHE FILEPATH "Path to the Microsoft WebView2Loader.dll")

    if (NOT EXISTS "${OPENFAD_WEBVIEW2_LOADER}")
        message(FATAL_ERROR
            "WebView2Loader.dll is required for the Windows WebView2 UI. "
            "Set OPENFAD_WEBVIEW2_LOADER to a compatible x64 loader DLL.")
    endif()

    if (TARGET openFADRotator_Standalone)
        add_custom_command(TARGET openFADRotator_Standalone POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                "${OPENFAD_WEBVIEW2_LOADER}"
                "$<TARGET_FILE_DIR:openFADRotator_Standalone>/WebView2Loader.dll")
    endif()

    if (TARGET openFADRotator_VST3)
        add_custom_command(TARGET openFADRotator_VST3 POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                "${OPENFAD_WEBVIEW2_LOADER}"
                "$<TARGET_FILE_DIR:openFADRotator_VST3>/WebView2Loader.dll")
    endif()
endif()

if (MSVC)
    target_compile_options(openFADRotator PRIVATE /utf-8)
endif()

set_target_properties(openFADRotator PROPERTIES
    CXX_VISIBILITY_PRESET hidden
    VISIBILITY_INLINES_HIDDEN YES
)

if (BUILD_TESTING)
    juce_add_console_app(openFADRotator_DSPTests
        PRODUCT_NAME "openFAD Rotator DSP Tests"
        COMPANY_NAME "openFAD"
        VERSION ${PROJECT_VERSION}
    )

    target_sources(openFADRotator_DSPTests PRIVATE
        Tests/RotatorDSPTests.cpp
        Source/RotatorDSP.cpp
    )

    target_link_libraries(openFADRotator_DSPTests PRIVATE
        juce::juce_audio_basics
        juce::juce_dsp
    )

    if (MSVC)
        target_compile_options(openFADRotator_DSPTests PRIVATE /utf-8)
    endif()

    add_test(NAME openFADRotator_DSPTests COMMAND openFADRotator_DSPTests)

    juce_add_console_app(openFADRotator_DSPPerformanceTests
        PRODUCT_NAME "openFAD Rotator DSP Performance Tests"
        COMPANY_NAME "openFAD"
        VERSION ${PROJECT_VERSION}
    )

    target_sources(openFADRotator_DSPPerformanceTests PRIVATE
        Tests/RotatorDSPPerformanceTests.cpp
        Source/RotatorDSP.cpp
    )

    target_link_libraries(openFADRotator_DSPPerformanceTests PRIVATE
        juce::juce_audio_basics
        juce::juce_dsp
    )

    if (MSVC)
        target_compile_options(openFADRotator_DSPPerformanceTests PRIVATE /utf-8)
    endif()

    add_test(NAME openFADRotator_DSPPerformanceTests COMMAND openFADRotator_DSPPerformanceTests)

    juce_add_console_app(openFADRotator_DSPAllocationTests
        PRODUCT_NAME "openFAD Rotator DSP Allocation Tests"
        COMPANY_NAME "openFAD"
        VERSION ${PROJECT_VERSION}
    )

    target_sources(openFADRotator_DSPAllocationTests PRIVATE
        Tests/RotatorDSPAllocationTests.cpp
        Source/RotatorDSP.cpp
    )

    target_link_libraries(openFADRotator_DSPAllocationTests PRIVATE
        juce::juce_audio_basics
        juce::juce_dsp
    )

    if (MSVC)
        target_compile_options(openFADRotator_DSPAllocationTests PRIVATE /utf-8)
    endif()

    add_test(NAME openFADRotator_DSPAllocationTests COMMAND openFADRotator_DSPAllocationTests)

    juce_add_console_app(openFADRotator_DSPSoakTests
        PRODUCT_NAME "openFAD Rotator DSP Soak Tests"
        COMPANY_NAME "openFAD"
        VERSION ${PROJECT_VERSION}
    )

    target_sources(openFADRotator_DSPSoakTests PRIVATE
        Tests/RotatorDSPSoakTests.cpp
        Source/RotatorDSP.cpp
    )

    target_link_libraries(openFADRotator_DSPSoakTests PRIVATE
        juce::juce_audio_basics
        juce::juce_dsp
    )

    if (MSVC)
        target_compile_options(openFADRotator_DSPSoakTests PRIVATE /utf-8)
    endif()

    add_test(NAME openFADRotator_DSPSoakTests COMMAND openFADRotator_DSPSoakTests)

    juce_add_console_app(openFADRotator_ProcessorTests
        PRODUCT_NAME "openFAD Rotator Processor Tests"
        COMPANY_NAME "openFAD"
        VERSION ${PROJECT_VERSION}
    )

    target_sources(openFADRotator_ProcessorTests PRIVATE
        Tests/ProcessorAudioTests.cpp
        Source/Parameters.cpp
        Source/RotatorDSP.cpp
        Source/PluginProcessor.cpp
        Source/PluginEditor.cpp
    )

    target_link_libraries(openFADRotator_ProcessorTests PRIVATE
        OpenFADRotatorWebData
        juce::juce_audio_utils
        juce::juce_dsp
        juce::juce_gui_extra
    )

    if (TARGET juce::juce_webview2)
        target_link_libraries(openFADRotator_ProcessorTests PRIVATE juce::juce_webview2)
    endif()

    target_compile_definitions(openFADRotator_ProcessorTests PRIVATE
        JUCE_WEB_BROWSER=1
        JUCE_VST3_CAN_REPLACE_VST2=0
    )

    if (WIN32)
        target_compile_definitions(openFADRotator_ProcessorTests PRIVATE JUCE_USE_WIN_WEBVIEW2=1)
    else()
        target_compile_definitions(openFADRotator_ProcessorTests PRIVATE JUCE_USE_WIN_WEBVIEW2=0)
    endif()

    if (MSVC)
        target_compile_options(openFADRotator_ProcessorTests PRIVATE /utf-8)
    endif()

    add_test(NAME openFADRotator_ProcessorTests COMMAND openFADRotator_ProcessorTests)

    juce_add_console_app(openFADRotator_ProcessorAllocationTests
        PRODUCT_NAME "openFAD Rotator Processor Allocation Tests"
        COMPANY_NAME "openFAD"
        VERSION ${PROJECT_VERSION}
    )

    target_sources(openFADRotator_ProcessorAllocationTests PRIVATE
        Tests/ProcessorAllocationTests.cpp
        Source/Parameters.cpp
        Source/RotatorDSP.cpp
        Source/PluginProcessor.cpp
        Source/PluginEditor.cpp
    )

    target_link_libraries(openFADRotator_ProcessorAllocationTests PRIVATE
        OpenFADRotatorWebData
        juce::juce_audio_utils
        juce::juce_dsp
        juce::juce_gui_extra
    )

    if (TARGET juce::juce_webview2)
        target_link_libraries(openFADRotator_ProcessorAllocationTests PRIVATE juce::juce_webview2)
    endif()

    target_compile_definitions(openFADRotator_ProcessorAllocationTests PRIVATE
        JUCE_WEB_BROWSER=1
        JUCE_VST3_CAN_REPLACE_VST2=0
    )

    if (WIN32)
        target_compile_definitions(openFADRotator_ProcessorAllocationTests PRIVATE JUCE_USE_WIN_WEBVIEW2=1)
    else()
        target_compile_definitions(openFADRotator_ProcessorAllocationTests PRIVATE JUCE_USE_WIN_WEBVIEW2=0)
    endif()

    if (MSVC)
        target_compile_options(openFADRotator_ProcessorAllocationTests PRIVATE /utf-8)
    endif()

    add_test(NAME openFADRotator_ProcessorAllocationTests COMMAND openFADRotator_ProcessorAllocationTests)

    juce_add_console_app(openFADRotator_ProcessorPerformanceTests
        PRODUCT_NAME "openFAD Rotator Processor Performance Tests"
        COMPANY_NAME "openFAD"
        VERSION ${PROJECT_VERSION}
    )

    target_sources(openFADRotator_ProcessorPerformanceTests PRIVATE
        Tests/ProcessorPerformanceTests.cpp
        Source/Parameters.cpp
        Source/RotatorDSP.cpp
        Source/PluginProcessor.cpp
        Source/PluginEditor.cpp
    )

    target_link_libraries(openFADRotator_ProcessorPerformanceTests PRIVATE
        OpenFADRotatorWebData
        juce::juce_audio_utils
        juce::juce_dsp
        juce::juce_gui_extra
    )

    if (TARGET juce::juce_webview2)
        target_link_libraries(openFADRotator_ProcessorPerformanceTests PRIVATE juce::juce_webview2)
    endif()

    target_compile_definitions(openFADRotator_ProcessorPerformanceTests PRIVATE
        JUCE_WEB_BROWSER=1
        JUCE_VST3_CAN_REPLACE_VST2=0
    )

    if (WIN32)
        target_compile_definitions(openFADRotator_ProcessorPerformanceTests PRIVATE JUCE_USE_WIN_WEBVIEW2=1)
    else()
        target_compile_definitions(openFADRotator_ProcessorPerformanceTests PRIVATE JUCE_USE_WIN_WEBVIEW2=0)
    endif()

    if (MSVC)
        target_compile_options(openFADRotator_ProcessorPerformanceTests PRIVATE /utf-8)
    endif()

    add_test(NAME openFADRotator_ProcessorPerformanceTests COMMAND openFADRotator_ProcessorPerformanceTests)

    juce_add_console_app(openFADRotator_VST3HostSmoke
        PRODUCT_NAME "openFAD Rotator VST3 Host Smoke"
        COMPANY_NAME "openFAD"
        VERSION ${PROJECT_VERSION}
    )

    target_sources(openFADRotator_VST3HostSmoke PRIVATE
        Tests/VST3HostSmokeTests.cpp
    )

    target_link_libraries(openFADRotator_VST3HostSmoke PRIVATE
        juce::juce_audio_processors_headless
        juce::juce_audio_formats
    )

    target_compile_definitions(openFADRotator_VST3HostSmoke PRIVATE
        JUCE_PLUGINHOST_VST3=1
        JUCE_PLUGINHOST_VST=0
        JUCE_PLUGINHOST_AU=0
        JUCE_PLUGINHOST_LV2=0
        JUCE_PLUGINHOST_LADSPA=0
    )

    if (MSVC)
        target_compile_options(openFADRotator_VST3HostSmoke PRIVATE /utf-8)
    endif()

    if (APPLE)
        set(OPENFAD_VST3_HOST_SMOKE_PATH
            "$<TARGET_BUNDLE_DIR:openFADRotator_VST3>")
    else()
        set(OPENFAD_VST3_HOST_SMOKE_PATH
            "$<TARGET_FILE_DIR:openFADRotator_VST3>/openFAD Rotator.vst3")
    endif()

    add_test(NAME openFADRotator_VST3HostSmoke
        COMMAND openFADRotator_VST3HostSmoke
            "${OPENFAD_VST3_HOST_SMOKE_PATH}"
    )
endif()
