#include "../Source/RotatorDSP.h"

#include <cmath>
#include <iostream>
#include <limits>
#include <vector>

namespace
{
bool allFinite (const juce::AudioBuffer<float>& buffer)
{
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
            if (! std::isfinite (buffer.getSample (channel, sample)))
                return false;

    return true;
}

openfad::RotatorDSP::Params neutralParams()
{
    openfad::RotatorDSP::Params params;
    params.inputTrimDb = 0.0f;
    params.outputTrimDb = 0.0f;
    params.mix = 1.0f;
    params.bypass = false;
    params.modelAmount = 0.0f;
    params.rotatorAmount = 0.0f;
    params.dreamBypass = true;
    params.distance = 1.0f;
    params.angle = 0.0f;
    params.renderMode = 1;
    params.earlyReflections = 0.0f;
    params.feedMode = 1;
    params.speedMode = 0;
    params.quality = 0;
    return params;
}

openfad::RotatorDSP::Params activeParams()
{
    auto params = neutralParams();
    params.modelAmount = 1.0f;
    params.rotatorAmount = 1.0f;
    params.dreamBypass = false;
    params.dream = 0.9f;
    params.diffusion = 0.85f;
    params.feedback = 0.9f;
    params.tail = 10.0f;
    params.predelay = 0.12f;
    params.speedMode = 3;
    params.freeRate = 7.0f;
    params.motion = 0.8f;
    params.depth = 0.9f;
    params.space = 0.8f;
    params.quality = 1;
    return params;
}

bool checkNeutrality (double sampleRate, int blockSize)
{
    openfad::RotatorDSP dsp;
    dsp.prepare (sampleRate, blockSize, 2);
    auto buffer = juce::AudioBuffer<float> (2, blockSize);
    auto expected = juce::AudioBuffer<float> (2, blockSize);

    for (int channel = 0; channel < 2; ++channel)
        for (int sample = 0; sample < blockSize; ++sample)
        {
            const auto value = 0.2f * std::sin (static_cast<float> (sample + channel * 3) * 0.17f);
            buffer.setSample (channel, sample, value);
            expected.setSample (channel, sample, value);
        }

    dsp.process (buffer, neutralParams(), false);
    if (! allFinite (buffer))
        return false;

    for (int channel = 0; channel < 2; ++channel)
        for (int sample = 0; sample < blockSize; ++sample)
            if (std::abs (buffer.getSample (channel, sample) - expected.getSample (channel, sample)) > 1.0e-5f)
            {
                std::cerr << "neutral mismatch c=" << channel << " n=" << sample
                          << " in=" << expected.getSample (channel, sample)
                          << " out=" << buffer.getSample (channel, sample) << "\n";
                return false;
            }

    return true;
}

bool checkActiveFinite (double sampleRate, int blockSize)
{
    openfad::RotatorDSP dsp;
    dsp.prepare (sampleRate, blockSize, 2);
    auto buffer = juce::AudioBuffer<float> (2, blockSize);
    for (int channel = 0; channel < 2; ++channel)
        for (int sample = 0; sample < blockSize; ++sample)
            buffer.setSample (channel, sample,
                              sample == 0 ? 1.0f
                                          : 0.12f * std::sin (static_cast<float> (sample) * 0.11f));

    dsp.process (buffer, activeParams(), true);
    if (! allFinite (buffer))
        return false;

    const auto snapshot = dsp.getTelemetrySnapshot();
    if (! std::isfinite (snapshot.rotorPhase)
        || ! std::isfinite (snapshot.rotorRate)
        || ! std::isfinite (snapshot.inputPeak)
        || ! std::isfinite (snapshot.outputPeak)
        || ! std::isfinite (snapshot.bandEnergy[0])
        || ! std::isfinite (snapshot.bandEnergy[1])
        || ! std::isfinite (snapshot.bandEnergy[2]))
        return false;

    return true;
}

bool checkInvalidInputIsContained()
{
    openfad::RotatorDSP dsp;
    dsp.prepare (48000.0, 7, 2);
    auto buffer = juce::AudioBuffer<float> (2, 7);
    buffer.clear();
    buffer.setSample (0, 0, std::numeric_limits<float>::quiet_NaN());
    buffer.setSample (1, 0, std::numeric_limits<float>::infinity());
    dsp.process (buffer, neutralParams(), false);
    return allFinite (buffer);
}

bool checkInvalidParametersAreContained()
{
    openfad::RotatorDSP dsp;
    dsp.prepare (std::numeric_limits<double>::quiet_NaN(), 31, 2);
    auto buffer = juce::AudioBuffer<float> (2, 31);
    for (int channel = 0; channel < 2; ++channel)
        for (int sample = 0; sample < 31; ++sample)
            buffer.setSample (channel, sample, 0.08f * std::sin (static_cast<float> (sample) * 0.19f));

    auto params = activeParams();
    params.inputTrimDb = std::numeric_limits<float>::quiet_NaN();
    params.freeRate = std::numeric_limits<float>::infinity();
    params.angle = std::numeric_limits<float>::infinity();
    params.feedback = std::numeric_limits<float>::quiet_NaN();
    params.bpm = std::numeric_limits<double>::quiet_NaN();
    dsp.process (buffer, params, true);

    const auto snapshot = dsp.getTelemetrySnapshot();
    return allFinite (buffer)
        && std::isfinite (snapshot.rotorPhase)
        && std::isfinite (snapshot.rotorRate)
        && std::isfinite (snapshot.inputPeak)
        && std::isfinite (snapshot.outputPeak)
        && std::isfinite (snapshot.bandEnergy[0])
        && std::isfinite (snapshot.bandEnergy[1])
        && std::isfinite (snapshot.bandEnergy[2]);
}
}

int main()
{
    const std::vector<double> sampleRates { 44100.0, 48000.0, 96000.0 };
    const std::vector<int> blockSizes { 0, 1, 7, 31, 127, 128, 511, 1024 };

    for (const auto sampleRate : sampleRates)
        for (const auto blockSize : blockSizes)
        {
            if (! checkNeutrality (sampleRate, blockSize)
                || ! checkActiveFinite (sampleRate, blockSize))
            {
                std::cerr << "DSP regression failed at " << sampleRate << " Hz / " << blockSize << " samples\n";
                return 1;
            }
        }

    if (! checkInvalidInputIsContained())
    {
        std::cerr << "DSP regression failed to contain non-finite input\n";
        return 1;
    }

    if (! checkInvalidParametersAreContained())
    {
        std::cerr << "DSP regression failed to contain non-finite parameters\n";
        return 1;
    }

    std::cout << "RotatorDSP tests passed\n";
    return 0;
}
