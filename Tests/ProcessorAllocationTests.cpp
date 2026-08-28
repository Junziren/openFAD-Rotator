#include "../Source/PluginProcessor.h"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdlib>
#include <iostream>
#include <new>

#if defined(_MSC_VER)
#include <malloc.h>
#endif

namespace allocationProbe
{
thread_local bool enabled = false;
thread_local std::size_t allocations = 0;

void* allocate (std::size_t size, std::size_t alignment)
{
    size = std::max<std::size_t> (size, 1u);
    void* pointer = nullptr;

    if (alignment <= alignof (std::max_align_t))
        pointer = std::malloc (size);
#if defined(_MSC_VER)
    else
        pointer = _aligned_malloc (size, alignment);
#else
    else
    {
        const auto paddedSize = ((size + alignment - 1u) / alignment) * alignment;
        pointer = std::aligned_alloc (alignment, paddedSize);
    }
#endif

    if (pointer == nullptr)
        throw std::bad_alloc();
    if (enabled)
        ++allocations;
    return pointer;
}

void* allocateNoThrow (std::size_t size, std::size_t alignment) noexcept
{
    try
    {
        return allocate (size, alignment);
    }
    catch (...)
    {
        return nullptr;
    }
}

void deallocate (void* pointer, std::size_t alignment) noexcept
{
    if (pointer == nullptr)
        return;

    if (alignment <= alignof (std::max_align_t))
        std::free (pointer);
#if defined(_MSC_VER)
    else
        _aligned_free (pointer);
#else
    else
        std::free (pointer);
#endif
}
} // namespace allocationProbe

void* operator new (std::size_t size)
{
    return allocationProbe::allocate (size, alignof (std::max_align_t));
}

void* operator new[] (std::size_t size)
{
    return allocationProbe::allocate (size, alignof (std::max_align_t));
}

void* operator new (std::size_t size, const std::nothrow_t&) noexcept
{
    return allocationProbe::allocateNoThrow (size, alignof (std::max_align_t));
}

void* operator new[] (std::size_t size, const std::nothrow_t&) noexcept
{
    return allocationProbe::allocateNoThrow (size, alignof (std::max_align_t));
}

void* operator new (std::size_t size, std::align_val_t alignment)
{
    return allocationProbe::allocate (size, static_cast<std::size_t> (alignment));
}

void* operator new[] (std::size_t size, std::align_val_t alignment)
{
    return allocationProbe::allocate (size, static_cast<std::size_t> (alignment));
}

void* operator new (std::size_t size,
                    std::align_val_t alignment,
                    const std::nothrow_t&) noexcept
{
    return allocationProbe::allocateNoThrow (size, static_cast<std::size_t> (alignment));
}

void* operator new[] (std::size_t size,
                      std::align_val_t alignment,
                      const std::nothrow_t&) noexcept
{
    return allocationProbe::allocateNoThrow (size, static_cast<std::size_t> (alignment));
}

void operator delete (void* pointer) noexcept
{
    allocationProbe::deallocate (pointer, alignof (std::max_align_t));
}

void operator delete[] (void* pointer) noexcept
{
    allocationProbe::deallocate (pointer, alignof (std::max_align_t));
}

void operator delete (void* pointer, std::size_t) noexcept
{
    allocationProbe::deallocate (pointer, alignof (std::max_align_t));
}

void operator delete[] (void* pointer, std::size_t) noexcept
{
    allocationProbe::deallocate (pointer, alignof (std::max_align_t));
}

void operator delete (void* pointer, const std::nothrow_t&) noexcept
{
    allocationProbe::deallocate (pointer, alignof (std::max_align_t));
}

void operator delete[] (void* pointer, const std::nothrow_t&) noexcept
{
    allocationProbe::deallocate (pointer, alignof (std::max_align_t));
}

void operator delete (void* pointer, std::align_val_t alignment) noexcept
{
    allocationProbe::deallocate (pointer, static_cast<std::size_t> (alignment));
}

void operator delete[] (void* pointer, std::align_val_t alignment) noexcept
{
    allocationProbe::deallocate (pointer, static_cast<std::size_t> (alignment));
}

void operator delete (void* pointer,
                      std::size_t,
                      std::align_val_t alignment) noexcept
{
    allocationProbe::deallocate (pointer, static_cast<std::size_t> (alignment));
}

void operator delete[] (void* pointer,
                        std::size_t,
                        std::align_val_t alignment) noexcept
{
    allocationProbe::deallocate (pointer, static_cast<std::size_t> (alignment));
}

void operator delete (void* pointer,
                      std::align_val_t alignment,
                      const std::nothrow_t&) noexcept
{
    allocationProbe::deallocate (pointer, static_cast<std::size_t> (alignment));
}

void operator delete[] (void* pointer,
                        std::align_val_t alignment,
                        const std::nothrow_t&) noexcept
{
    allocationProbe::deallocate (pointer, static_cast<std::size_t> (alignment));
}

namespace
{
using Processor = OpenFADRotatorAudioProcessor;

class TestPlayHead final : public juce::AudioPlayHead
{
public:
    juce::Optional<PositionInfo> getPosition() const override
    {
        return juce::makeOptional (position);
    }

    PositionInfo position;
};

void fillSignal (juce::AudioBuffer<float>& buffer, int offset)
{
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
            buffer.setSample (channel, sample,
                              0.19f * std::sin (static_cast<float> (offset + sample + channel * 17) * 0.071f));
}

bool allFinite (const juce::AudioBuffer<float>& buffer)
{
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
            if (! std::isfinite (buffer.getSample (channel, sample)))
                return false;
    return true;
}

bool setActual (Processor& processor, const char* id, float actual)
{
    auto* parameter = processor.parameters.getParameter (id);
    auto* ranged = dynamic_cast<juce::RangedAudioParameter*> (parameter);
    if (parameter == nullptr || ranged == nullptr)
        return false;

    parameter->setValueNotifyingHost (ranged->getNormalisableRange().convertTo0to1 (actual));
    return true;
}

void storeActual (std::atomic<float>* raw, float value) noexcept
{
    if (raw != nullptr)
        raw->store (value, std::memory_order_relaxed);
}
}

int main()
{
    constexpr auto sampleRate = 48000.0;
    constexpr int blockSize = 128;
    constexpr int warmupBlocks = 512;
    constexpr int measuredBlocks = 4096;

    Processor processor;
    TestPlayHead playHead;
    playHead.position.setBpm (128.0);
    playHead.position.setIsPlaying (true);
    processor.setPlayHead (&playHead);
    processor.prepareToPlay (sampleRate, blockSize);

    if (! setActual (processor, openfad::params::id::model, 5.0f)
        || ! setActual (processor, openfad::params::id::quality, 1.0f)
        || ! setActual (processor, openfad::params::id::structure, 2.0f)
        || ! setActual (processor, openfad::params::id::feedMode, 2.0f)
        || ! setActual (processor, openfad::params::id::renderMode, 0.0f)
        || ! setActual (processor, openfad::params::id::speedMode, 3.0f)
        || ! setActual (processor, openfad::params::id::freeRate, 7.0f)
        || ! setActual (processor, openfad::params::id::depth, 0.9f)
        || ! setActual (processor, openfad::params::id::rotatorAmount, 1.0f)
        || ! setActual (processor, openfad::params::id::dopplerAmount, 1.0f)
        || ! setActual (processor, openfad::params::id::dream, 0.85f)
        || ! setActual (processor, openfad::params::id::diffusion, 0.8f)
        || ! setActual (processor, openfad::params::id::feedback, 0.86f)
        || ! setActual (processor, openfad::params::id::mix, 1.0f))
    {
        std::cerr << "could not configure processor allocation probe\n";
        return 1;
    }

    auto* model = processor.parameters.getRawParameterValue (openfad::params::id::model);
    auto* speedMode = processor.parameters.getRawParameterValue (openfad::params::id::speedMode);
    auto* renderMode = processor.parameters.getRawParameterValue (openfad::params::id::renderMode);
    auto* direction = processor.parameters.getRawParameterValue (openfad::params::id::direction);
    auto* doppler = processor.parameters.getRawParameterValue (openfad::params::id::dopplerAmount);
    auto* rotator = processor.parameters.getRawParameterValue (openfad::params::id::rotatorAmount);
    auto* dreamBypass = processor.parameters.getRawParameterValue (openfad::params::id::dreamBypass);
    auto* freeze = processor.parameters.getRawParameterValue (openfad::params::id::freeze);
    auto* angle = processor.parameters.getRawParameterValue (openfad::params::id::angle);
    if (model == nullptr || speedMode == nullptr || renderMode == nullptr || direction == nullptr
        || doppler == nullptr || rotator == nullptr || dreamBypass == nullptr || freeze == nullptr
        || angle == nullptr)
    {
        std::cerr << "processor allocation probe could not cache raw parameters\n";
        return 1;
    }

    juce::AudioBuffer<float> buffer (2, blockSize);
    juce::MidiBuffer emptyMidi;
    juce::MidiBuffer noteOnMidi;
    juce::MidiBuffer noteOffMidi;
    noteOnMidi.addEvent (juce::MidiMessage::noteOn (1, 60, static_cast<juce::uint8> (100)), 0);
    noteOffMidi.addEvent (juce::MidiMessage::noteOff (1, 60), 0);

    for (int block = 0; block < warmupBlocks; ++block)
    {
        fillSignal (buffer, block * blockSize);
        storeActual (model, static_cast<float> ((block / 37) % 8));
        storeActual (speedMode, static_cast<float> (block % 5));
        storeActual (renderMode, static_cast<float> ((block / 19) & 1));
        storeActual (direction, static_cast<float> ((block / 11) & 1));
        storeActual (doppler, static_cast<float> (block % 101) / 100.0f);
        storeActual (rotator, static_cast<float> ((block * 7) % 101) / 100.0f);
        storeActual (dreamBypass, static_cast<float> ((block / 43) & 1));
        storeActual (freeze, static_cast<float> ((block / 61) & 1));
        storeActual (angle, -45.0f + static_cast<float> (block % 91));

        auto& midi = (block % 31 == 0) ? noteOnMidi
                                      : (block % 31 == 1 ? noteOffMidi : emptyMidi);
        processor.processBlock (buffer, midi);
    }

    if (! allFinite (buffer))
    {
        std::cerr << "non-finite output during processor allocation probe warmup\n";
        return 1;
    }

    allocationProbe::allocations = 0;
    allocationProbe::enabled = true;
    for (int block = 0; block < measuredBlocks; ++block)
    {
        fillSignal (buffer, (warmupBlocks + block) * blockSize);
        storeActual (model, static_cast<float> ((block / 37) % 8));
        storeActual (speedMode, static_cast<float> (block % 5));
        storeActual (renderMode, static_cast<float> ((block / 19) & 1));
        storeActual (direction, static_cast<float> ((block / 11) & 1));
        storeActual (doppler, static_cast<float> (block % 101) / 100.0f);
        storeActual (rotator, static_cast<float> ((block * 7) % 101) / 100.0f);
        storeActual (dreamBypass, static_cast<float> ((block / 43) & 1));
        storeActual (freeze, static_cast<float> ((block / 61) & 1));
        storeActual (angle, -45.0f + static_cast<float> (block % 91));

        auto& midi = (block % 31 == 0) ? noteOnMidi
                                      : (block % 31 == 1 ? noteOffMidi : emptyMidi);
        processor.processBlock (buffer, midi);
        if (! allFinite (buffer))
        {
            allocationProbe::enabled = false;
            std::cerr << "non-finite output during processor allocation probe\n";
            return 1;
        }
    }
    allocationProbe::enabled = false;

    if (allocationProbe::allocations != 0)
    {
        std::cerr << "processor processBlock allocated " << allocationProbe::allocations
                  << " times after prepare\n";
        return 1;
    }

    processor.setPlayHead (nullptr);
    std::cout << "Processor callback allocation check passed: blocks="
              << measuredBlocks << " allocations=0\n";
    return 0;
}
