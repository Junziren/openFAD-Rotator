#include "../Source/RotatorDSP.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <memory>
#include <random>

namespace
{
bool allFiniteAndBounded (const juce::AudioBuffer<float>& buffer, float& peak)
{
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
        {
            const auto value = buffer.getSample (channel, sample);
            if (! std::isfinite (value))
                return false;
            peak = std::max (peak, std::abs (value));
        }

    return true;
}

openfad::RotatorDSP::Params nextAutomatedParams (std::mt19937& random, int block)
{
    std::uniform_real_distribution<float> unit (0.0f, 1.0f);
    std::uniform_real_distribution<float> rate (0.02f, 20.0f);
    std::uniform_real_distribution<float> bpm (20.0f, 300.0f);
    std::uniform_real_distribution<float> angle (-45.0f, 45.0f);
    openfad::RotatorDSP::Params params;

    params.inputTrimDb = -6.0f + unit (random) * 12.0f;
    params.outputTrimDb = -3.0f + unit (random) * 6.0f;
    params.mix = 0.15f + unit (random) * 0.85f;
    params.bypass = (block % 97) == 0;
    params.quality = block & 1;
    params.model = block % 8;
    params.modelBypass = (block % 53) == 0;
    params.drive = unit (random);
    params.resonance = unit (random);
    params.damping = unit (random);
    params.loudnessMatch = (block % 5) != 0;
    params.structure = block % 3;
    params.feedMode = block % 3;
    params.renderMode = block & 1;
    params.speedMode = block % 5;
    params.freeRate = rate (random);
    params.syncDivision = block % 9;
    params.inertia = 0.05f + unit (random) * 11.95f;
    params.direction = (block / 3) & 1;
    params.depth = unit (random);
    params.distance = 0.5f + unit (random) * 2.5f;
    params.angle = angle (random);
    params.earlyReflections = unit (random);
    params.roomDamping = unit (random);
    params.modelAmount = unit (random);
    params.rotatorAmount = unit (random);
    params.dopplerAmount = unit (random);
    params.dreamBypass = (block % 61) == 0;
    params.predelay = unit (random) * 0.25f;
    params.predelaySync = (block % 7) == 0;
    params.diffusion = unit (random);
    params.tail = 0.2f + unit (random) * 11.8f;
    params.microshift = unit (random) * 25.0f;
    params.dreamDamping = unit (random);
    params.feedback = unit (random) * 0.96f;
    params.freeze = (block % 89) == 0;
    params.character = unit (random);
    params.motion = unit (random);
    params.space = unit (random);
    params.dream = unit (random);
    params.bpm = bpm (random);
    return params;
}

bool runSoak (double sampleRate, double seconds)
{
    constexpr std::array<int, 8> blockSizes { 1, 7, 31, 64, 127, 256, 512, 1024 };
    constexpr uint32_t seed = 0x4f465244u;
    const auto targetSamples = static_cast<int64_t> (std::ceil (sampleRate * seconds));

    openfad::RotatorDSP dsp;
    dsp.prepare (sampleRate, blockSizes.back(), 2);

    std::array<std::unique_ptr<juce::AudioBuffer<float>>, blockSizes.size()> buffers;
    for (size_t index = 0; index < blockSizes.size(); ++index)
        buffers[index] = std::make_unique<juce::AudioBuffer<float>> (2, blockSizes[index]);

    std::mt19937 random (seed ^ static_cast<uint32_t> (std::llround (sampleRate)));
    auto processedSamples = int64_t { 0 };
    auto block = 0;
    auto maximumPeak = 0.0f;
    auto previousParams = nextAutomatedParams (random, 0);

    while (processedSamples < targetSamples)
    {
        const auto sizeIndex = static_cast<size_t> (block % static_cast<int> (blockSizes.size()));
        auto& buffer = *buffers[sizeIndex];
        const auto params = (block % 37 == 0)
            ? nextAutomatedParams (random, block)
            : previousParams;
        previousParams = params;

        for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
            for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
            {
                const auto absoluteSample = processedSamples + sample;
                const auto carrier = std::sin (static_cast<float> (absoluteSample + channel * 17) * 0.013f);
                const auto detail = std::sin (static_cast<float> (absoluteSample + channel * 5) * 0.071f);
                buffer.setSample (channel, sample, 0.14f * carrier + 0.09f * detail);
            }

        dsp.process (buffer, params, true);
        if (! allFiniteAndBounded (buffer, maximumPeak))
        {
            std::cerr << "non-finite soak output at " << sampleRate
                      << " Hz, block " << block << "\n";
            return false;
        }

        processedSamples += buffer.getNumSamples();
        ++block;
    }

    const auto telemetry = dsp.getTelemetrySnapshot();
    if (! std::isfinite (maximumPeak) || maximumPeak > 1.0f
        || ! std::isfinite (telemetry.rotorPhase)
        || ! std::isfinite (telemetry.rotorRate)
        || ! std::isfinite (telemetry.inputPeak)
        || ! std::isfinite (telemetry.outputPeak)
        || ! std::isfinite (telemetry.bandEnergy[0])
        || ! std::isfinite (telemetry.bandEnergy[1])
        || ! std::isfinite (telemetry.bandEnergy[2]))
    {
        std::cerr << "invalid soak telemetry at " << sampleRate
                  << " Hz, peak=" << maximumPeak << "\n";
        return false;
    }

    std::cout << std::fixed << std::setprecision (2)
              << "DSP soak sr=" << sampleRate
              << " seconds=" << (static_cast<double> (processedSamples) / sampleRate)
              << " blocks=" << block
              << " peak=" << maximumPeak << "\n";
    return true;
}
}

int main()
{
    if (! runSoak (48000.0, 120.0)
        || ! runSoak (96000.0, 20.0))
        return 1;

    std::cout << "RotatorDSP soak checks passed\n";
    return 0;
}
