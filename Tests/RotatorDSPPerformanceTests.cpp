#include "../Source/RotatorDSP.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <vector>

namespace
{
openfad::RotatorDSP::Params benchmarkParams()
{
    openfad::RotatorDSP::Params params;
    params.model = 5;
    params.quality = 1;
    params.structure = 2;
    params.feedMode = 2;
    params.renderMode = 0;
    params.speedMode = 3;
    params.freeRate = 7.0f;
    params.depth = 0.9f;
    params.rotatorAmount = 1.0f;
    params.modelAmount = 1.0f;
    params.dreamBypass = false;
    params.dream = 0.9f;
    params.diffusion = 0.85f;
    params.feedback = 0.9f;
    params.tail = 10.0f;
    params.predelay = 0.12f;
    params.motion = 0.8f;
    params.space = 0.8f;
    params.character = 0.8f;
    return params;
}

float percentile (std::vector<double>& values, double fraction)
{
    if (values.empty())
        return 0.0f;

    const auto index = static_cast<size_t> (std::clamp (
        static_cast<long long> (std::llround (fraction * static_cast<double> (values.size() - 1))),
        0LL,
        static_cast<long long> (values.size() - 1)));
    std::nth_element (values.begin(), values.begin() + static_cast<std::ptrdiff_t> (index), values.end());
    return static_cast<float> (values[index]);
}

bool allFinite (const juce::AudioBuffer<float>& buffer)
{
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
            if (! std::isfinite (buffer.getSample (channel, sample)))
                return false;

    return true;
}

bool runBlockBenchmark (int blockSize, double sampleRate)
{
    constexpr int warmupBlocks = 250;
    constexpr int measuredBlocks = 1500;

    openfad::RotatorDSP dsp;
    dsp.prepare (sampleRate, blockSize, 2);
    auto buffer = juce::AudioBuffer<float> (2, blockSize);
    auto params = benchmarkParams();

    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        for (int sample = 0; sample < blockSize; ++sample)
            buffer.setSample (channel, sample,
                              0.18f * std::sin (static_cast<float> (sample + channel * 13) * 0.071f));

    for (int block = 0; block < warmupBlocks; ++block)
    {
        params.direction = block & 1;
        params.speedMode = block % 3 == 0 ? 2 : 3;
        dsp.process (buffer, params, true);
    }

    std::vector<double> durations;
    durations.reserve (measuredBlocks);
    for (int block = 0; block < measuredBlocks; ++block)
    {
        params.direction = block & 1;
        params.speedMode = block % 3 == 0 ? 2 : 3;
        const auto started = std::chrono::steady_clock::now();
        dsp.process (buffer, params, true);
        const auto finished = std::chrono::steady_clock::now();
        durations.push_back (std::chrono::duration<double, std::milli> (finished - started).count());

        if (! allFinite (buffer))
        {
            std::cerr << "non-finite output at block size " << blockSize << "\n";
            return false;
        }
    }

    const auto p50 = percentile (durations, 0.50);
    const auto p95 = percentile (durations, 0.95);
    const auto p99 = percentile (durations, 0.99);
    const auto maximum = *std::max_element (durations.begin(), durations.end());
    const auto deadline = static_cast<double> (blockSize) / sampleRate * 1000.0;

    std::cout << std::fixed << std::setprecision (4)
              << "DSP perf sr=" << sampleRate
              << " block=" << blockSize
              << " deadline_ms=" << deadline
              << " p50_ms=" << p50
              << " p95_ms=" << p95
              << " p99_ms=" << p99
              << " max_ms=" << maximum
              << " p99_ratio=" << (p99 / deadline)
              << " max_ratio=" << (maximum / deadline)
              << "\n";

    // This is an evidence runner, not a scheduler-sensitive hard gate. A
    // gross regression still fails, while the full percentile record remains
    // useful on machines with occasional background scheduling stalls.
    if (! std::isfinite (p99) || ! std::isfinite (maximum) || p99 > deadline * 4.0)
    {
        std::cerr << "DSP callback p99 exceeded 4x deadline at block size " << blockSize << "\n";
        return false;
    }

    return true;
}
}

int main()
{
    constexpr double sampleRate = 48000.0;
    for (const auto blockSize : { 64, 128, 256, 512, 1024 })
        if (! runBlockBenchmark (blockSize, sampleRate))
            return 1;

    std::cout << "RotatorDSP performance checks passed\n";
    return 0;
}
