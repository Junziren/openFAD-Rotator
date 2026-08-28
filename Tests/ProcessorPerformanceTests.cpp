#include "../Source/PluginProcessor.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <vector>

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
                              0.18f * std::sin (static_cast<float> (offset + sample + channel * 13) * 0.071f)
                              + 0.06f * std::sin (static_cast<float> (offset + sample) * 0.017f));
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

bool runBlockBenchmark (int blockSize, double sampleRate)
{
    constexpr int warmupBlocks = 180;
    constexpr int measuredBlocks = 1000;

    Processor processor;
    TestPlayHead playHead;
    playHead.position.setBpm (128.0);
    playHead.position.setIsPlaying (true);
    processor.setPlayHead (&playHead);
    processor.setNonRealtime (true);
    processor.prepareToPlay (sampleRate, blockSize);

    if (! setActual (processor, openfad::params::id::quality, 1.0f)
        || ! setActual (processor, openfad::params::id::model, 5.0f)
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
        std::cerr << "could not configure Processor performance benchmark\n";
        return false;
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
        std::cerr << "could not cache Processor performance parameters\n";
        return false;
    }

    auto buffer = juce::AudioBuffer<float> (2, blockSize);
    juce::MidiBuffer emptyMidi;
    std::vector<double> durations;
    durations.reserve (measuredBlocks);

    const auto updateParameters = [&] (int block)
    {
        model->store (static_cast<float> ((block / 37) % 8), std::memory_order_relaxed);
        speedMode->store (static_cast<float> (block % 5), std::memory_order_relaxed);
        renderMode->store (static_cast<float> ((block / 19) & 1), std::memory_order_relaxed);
        direction->store (static_cast<float> ((block / 11) & 1), std::memory_order_relaxed);
        doppler->store (static_cast<float> (block % 101) / 100.0f, std::memory_order_relaxed);
        rotator->store (static_cast<float> ((block * 7) % 101) / 100.0f, std::memory_order_relaxed);
        dreamBypass->store (static_cast<float> ((block / 43) & 1), std::memory_order_relaxed);
        freeze->store (static_cast<float> ((block / 61) & 1), std::memory_order_relaxed);
        angle->store (-45.0f + static_cast<float> (block % 91), std::memory_order_relaxed);
    };

    for (int block = 0; block < warmupBlocks; ++block)
    {
        fillSignal (buffer, block * blockSize);
        updateParameters (block);
        processor.processBlock (buffer, emptyMidi);
    }

    if (! allFinite (buffer))
    {
        std::cerr << "non-finite output during Processor performance warmup\n";
        return false;
    }

    for (int block = 0; block < measuredBlocks; ++block)
    {
        fillSignal (buffer, (warmupBlocks + block) * blockSize);
        updateParameters (warmupBlocks + block);
        const auto started = std::chrono::steady_clock::now();
        processor.processBlock (buffer, emptyMidi);
        const auto finished = std::chrono::steady_clock::now();
        durations.push_back (std::chrono::duration<double, std::milli> (finished - started).count());

        if (! allFinite (buffer))
        {
            std::cerr << "non-finite Processor output at sample rate " << sampleRate
                      << " block size " << blockSize << "\n";
            return false;
        }
    }

    const auto p50 = percentile (durations, 0.50);
    const auto p95 = percentile (durations, 0.95);
    const auto p99 = percentile (durations, 0.99);
    const auto maximum = *std::max_element (durations.begin(), durations.end());
    const auto deadline = static_cast<double> (blockSize) / sampleRate * 1000.0;

    std::cout << std::fixed << std::setprecision (4)
              << "Processor perf sr=" << sampleRate
              << " block=" << blockSize
              << " deadline_ms=" << deadline
              << " p50_ms=" << p50
              << " p95_ms=" << p95
              << " p99_ms=" << p99
              << " max_ms=" << maximum
              << " p99_ratio=" << (p99 / deadline)
              << " max_ratio=" << (maximum / deadline)
              << "\n";

    if (! std::isfinite (p99) || ! std::isfinite (maximum) || p99 > deadline * 4.0)
    {
        std::cerr << "Processor callback p99 exceeded 4x deadline at sample rate "
                  << sampleRate << " block size " << blockSize << "\n";
        return false;
    }

    processor.setPlayHead (nullptr);
    return true;
}
}

int main()
{
    for (const auto sampleRate : { 44100.0, 48000.0, 88200.0, 96000.0, 192000.0 })
        for (const auto blockSize : { 64, 128, 256, 512, 1024 })
            if (! runBlockBenchmark (blockSize, sampleRate))
                return 1;

    std::cout << "Processor performance checks passed\n";
    return 0;
}
