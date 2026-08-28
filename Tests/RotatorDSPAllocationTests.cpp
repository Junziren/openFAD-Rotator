#include "../Source/RotatorDSP.h"

#include <juce_audio_basics/juce_audio_basics.h>

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

void* operator new (std::size_t size, std::align_val_t alignment)
{
    return allocationProbe::allocate (size, static_cast<std::size_t> (alignment));
}

void* operator new[] (std::size_t size, std::align_val_t alignment)
{
    return allocationProbe::allocate (size, static_cast<std::size_t> (alignment));
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

void operator delete (void* pointer, std::align_val_t alignment) noexcept
{
    allocationProbe::deallocate (pointer, static_cast<std::size_t> (alignment));
}

void operator delete[] (void* pointer, std::align_val_t alignment) noexcept
{
    allocationProbe::deallocate (pointer, static_cast<std::size_t> (alignment));
}

void operator delete (void* pointer, std::size_t, std::align_val_t alignment) noexcept
{
    allocationProbe::deallocate (pointer, static_cast<std::size_t> (alignment));
}

void operator delete[] (void* pointer, std::size_t, std::align_val_t alignment) noexcept
{
    allocationProbe::deallocate (pointer, static_cast<std::size_t> (alignment));
}

namespace
{
void fillSignal (juce::AudioBuffer<float>& buffer)
{
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
            buffer.setSample (channel, sample,
                              0.17f * std::sin (static_cast<float> (sample + channel * 17) * 0.071f));
}

bool allFinite (const juce::AudioBuffer<float>& buffer)
{
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
            if (! std::isfinite (buffer.getSample (channel, sample)))
                return false;
    return true;
}
}

int main()
{
    constexpr auto sampleRate = 48000.0;
    constexpr auto blockSize = 128;
    constexpr auto warmupBlocks = 256;
    constexpr auto measuredBlocks = 4096;

    openfad::RotatorDSP dsp;
    dsp.prepare (sampleRate, blockSize, 2);
    juce::AudioBuffer<float> buffer (2, blockSize);
    fillSignal (buffer);

    openfad::RotatorDSP::Params params;
    for (int block = 0; block < warmupBlocks; ++block)
    {
        params.speedMode = block % 5;
        params.direction = block & 1;
        params.dopplerAmount = static_cast<float> (block % 11) / 10.0f;
        params.dream = static_cast<float> (block % 7) / 6.0f;
        dsp.process (buffer, params, true);
    }

    if (! allFinite (buffer))
    {
        std::cerr << "non-finite output during allocation probe warmup\n";
        return 1;
    }

    allocationProbe::allocations = 0;
    allocationProbe::enabled = true;
    for (int block = 0; block < measuredBlocks; ++block)
    {
        params.speedMode = block % 5;
        params.direction = (block / 17) & 1;
        params.freeRate = 0.02f + static_cast<float> (block % 100) * 0.17f;
        params.dopplerAmount = static_cast<float> (block % 101) / 100.0f;
        params.rotatorAmount = static_cast<float> ((block * 7) % 101) / 100.0f;
        params.model = (block / 23) % 8;
        params.renderMode = (block / 31) & 1;
        params.dreamBypass = (block / 37) & 1;
        params.freeze = (block / 43) & 1;
        dsp.process (buffer, params, true);
    }
    allocationProbe::enabled = false;

    if (! allFinite (buffer))
    {
        std::cerr << "non-finite output during allocation probe\n";
        return 1;
    }

    if (allocationProbe::allocations != 0)
    {
        std::cerr << "audio callback allocated " << allocationProbe::allocations
                  << " times after prepare\n";
        return 1;
    }

    std::cout << "RotatorDSP callback allocation check passed: blocks="
              << measuredBlocks << " allocations=0\n";
    return 0;
}
