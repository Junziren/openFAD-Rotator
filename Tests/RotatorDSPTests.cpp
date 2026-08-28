#include "../Source/RotatorDSP.h"

#include <algorithm>
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

float bufferMaximumDifference (const juce::AudioBuffer<float>& left,
                               const juce::AudioBuffer<float>& right)
{
    auto result = 0.0f;
    const auto channels = std::min (left.getNumChannels(), right.getNumChannels());
    const auto samples = std::min (left.getNumSamples(), right.getNumSamples());
    for (int channel = 0; channel < channels; ++channel)
        for (int sample = 0; sample < samples; ++sample)
            result = std::max (result,
                               std::abs (left.getSample (channel, sample)
                                         - right.getSample (channel, sample)));
    return result;
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
    params.dopplerAmount = 0.0f;
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
    params.dopplerAmount = 1.0f;
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
        || ! std::isfinite (snapshot.rotorSignedRate)
        || ! std::isfinite (snapshot.inputPeak)
        || ! std::isfinite (snapshot.outputPeak)
        || ! std::isfinite (snapshot.bandEnergy[0])
        || ! std::isfinite (snapshot.bandEnergy[1])
        || ! std::isfinite (snapshot.bandEnergy[2]))
        return false;

    return true;
}

bool checkActiveOutputChanges (double sampleRate, int blockSize)
{
    if (blockSize <= 0)
        return true;

    openfad::RotatorDSP dsp;
    dsp.prepare (sampleRate, blockSize, 2);
    auto buffer = juce::AudioBuffer<float> (2, blockSize);
    auto expected = juce::AudioBuffer<float> (2, blockSize);

    for (int channel = 0; channel < 2; ++channel)
        for (int sample = 0; sample < blockSize; ++sample)
        {
            const auto value = 0.35f * std::sin (static_cast<float> (sample + channel * 5) * 0.071f);
            buffer.setSample (channel, sample, value);
            expected.setSample (channel, sample, value);
        }

    auto params = activeParams();
    dsp.process (buffer, params, true);

    auto maximumDifference = 0.0f;
    for (int channel = 0; channel < 2; ++channel)
        for (int sample = 0; sample < blockSize; ++sample)
            maximumDifference = std::max (maximumDifference,
                                          std::abs (buffer.getSample (channel, sample)
                                                    - expected.getSample (channel, sample)));

    if (! std::isfinite (maximumDifference) || maximumDifference < 1.0e-3f)
    {
        std::cerr << "active DSP did not change the signal; max difference="
                  << maximumDifference << "\n";
        return false;
    }

    return true;
}

float wrappedPhaseDelta (float from, float to)
{
    constexpr auto twoPi = 2.0f * 3.14159265358979323846f;
    constexpr auto pi = 3.14159265358979323846f;
    auto delta = to - from;
    if (delta > pi)
        delta -= twoPi;
    else if (delta < -pi)
        delta += twoPi;
    return delta;
}

bool checkDirectionTransitionIsSmooth (double sampleRate, int blockSize)
{
    if (blockSize <= 0)
        return true;

    constexpr auto probeBlockSize = 32;
    openfad::RotatorDSP dsp;
    dsp.prepare (sampleRate, probeBlockSize, 2);
    auto buffer = juce::AudioBuffer<float> (2, probeBlockSize);
    auto params = activeParams();
    params.modelAmount = 0.0f;
    params.dreamBypass = true;
    params.speedMode = 1;
    params.inertia = 0.2f;

    for (int block = 0; block < 100; ++block)
    {
        for (int channel = 0; channel < 2; ++channel)
            for (int sample = 0; sample < probeBlockSize; ++sample)
                buffer.setSample (channel, sample,
                                  0.1f * std::sin (static_cast<float> (sample + block * probeBlockSize) * 0.13f));
        dsp.process (buffer, params, true);
    }

    auto previousPhase = dsp.getTelemetrySnapshot().rotorPhase;
    params.direction = 1;
    auto sawForward = false;
    auto sawReverse = false;
    auto sawSignedForward = false;
    auto sawSignedReverse = false;
    auto sawSignedZero = false;
    // Observe a fixed amount of wall-clock time so high sample rates do not
    // truncate the inertia-limited coast-through-zero transition.
    const auto transitionBlocks = std::max (100,
                                            static_cast<int> (std::ceil (sampleRate * 0.1
                                                                          / static_cast<double> (probeBlockSize))));
    for (int block = 0; block < transitionBlocks; ++block)
    {
        dsp.process (buffer, params, true);
        const auto snapshot = dsp.getTelemetrySnapshot();
        const auto currentPhase = snapshot.rotorPhase;
        const auto delta = wrappedPhaseDelta (previousPhase, currentPhase);
        sawForward = sawForward || delta > 1.0e-5f;
        sawReverse = sawReverse || delta < -1.0e-5f;
        sawSignedForward = sawSignedForward || snapshot.rotorSignedRate > 1.0e-4f;
        sawSignedReverse = sawSignedReverse || snapshot.rotorSignedRate < -1.0e-4f;
        sawSignedZero = sawSignedZero || std::abs (snapshot.rotorSignedRate) < 0.08f;
        previousPhase = currentPhase;
    }

    if (! sawForward || ! sawReverse || ! sawSignedForward || ! sawSignedReverse || ! sawSignedZero)
    {
        std::cerr << "direction transition did not coast through zero; forward="
                  << sawForward << " reverse=" << sawReverse
                  << " signedForward=" << sawSignedForward
                  << " signedReverse=" << sawSignedReverse
                  << " signedZero=" << sawSignedZero << "\n";
        return false;
    }

    return true;
}

bool checkDirectionTransitionAudioContinuity (double sampleRate, int blockSize)
{
    if (blockSize <= 0)
        return true;

    constexpr auto probeBlockSize = 64;
    constexpr auto warmupBlocks = 160;
    constexpr auto transitionBlocks = 160;
    openfad::RotatorDSP dsp;
    dsp.prepare (sampleRate, probeBlockSize, 2);
    auto buffer = juce::AudioBuffer<float> (2, probeBlockSize);
    auto params = activeParams();
    params.modelAmount = 0.0f;
    params.dreamBypass = true;
    params.speedMode = 3;
    params.freeRate = 7.0f;
    params.motion = 1.0f;
    params.depth = 1.0f;
    params.rotatorAmount = 1.0f;
    params.inertia = 0.18f;
    params.mix = 1.0f;
    params.renderMode = 1;
    params.direction = 0;

    auto fill = [&buffer] (int offset)
    {
        for (int channel = 0; channel < 2; ++channel)
            for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
                buffer.setSample (channel, sample,
                                  0.17f * std::sin (static_cast<float> (offset + sample + channel * 11) * 0.23f));
    };

    for (int block = 0; block < warmupBlocks; ++block)
    {
        fill (block * probeBlockSize);
        dsp.process (buffer, params, true);
    }

    params.direction = 1;
    auto previous = 0.0f;
    auto maximumStep = 0.0f;
    auto sawZeroCrossing = false;
    for (int block = 0; block < transitionBlocks; ++block)
    {
        fill ((warmupBlocks + block) * probeBlockSize);
        dsp.process (buffer, params, true);
        const auto snapshot = dsp.getTelemetrySnapshot();
        if (block > 0 && snapshot.rotorRate < 0.08f)
            sawZeroCrossing = true;

        for (int sample = 0; sample < probeBlockSize; ++sample)
        {
            const auto current = buffer.getSample (0, sample);
            if (block > 0 || sample > 0)
                maximumStep = std::max (maximumStep, std::abs (current - previous));
            previous = current;
        }
    }

    // The threshold is intentionally broad: this guards against a full-scale
    // discontinuity at the coast-through-zero point without acting as a
    // machine-specific audio quality assertion.
    if (! sawZeroCrossing || ! std::isfinite (maximumStep) || maximumStep > 0.85f)
    {
        std::cerr << "direction transition audio discontinuity; zero=" << sawZeroCrossing
                  << " maxStep=" << maximumStep << "\n";
        return false;
    }

    return true;
}

bool checkDopplerDelayIsPresent (double sampleRate, int blockSize)
{
    if (blockSize <= 0)
        return true;

    const auto probeBlockSize = std::max (blockSize, 256);

    openfad::RotatorDSP active;
    openfad::RotatorDSP bypassed;
    active.prepare (sampleRate, probeBlockSize, 2);
    bypassed.prepare (sampleRate, probeBlockSize, 2);
    auto activeBuffer = juce::AudioBuffer<float> (2, probeBlockSize);
    auto bypassedBuffer = juce::AudioBuffer<float> (2, probeBlockSize);
    activeBuffer.clear();
    bypassedBuffer.clear();
    activeBuffer.setSample (0, 0, 1.0f);
    activeBuffer.setSample (1, 0, 1.0f);
    bypassedBuffer.setSample (0, 0, 1.0f);
    bypassedBuffer.setSample (1, 0, 1.0f);

    auto params = neutralParams();
    params.modelBypass = true;
    params.modelAmount = 0.0f;
    params.rotatorAmount = 0.0f;
    params.dopplerAmount = 1.0f;
    params.depth = 1.0f;
    params.motion = 1.0f;
    params.speedMode = 3;
    params.freeRate = 6.5f;
    params.inertia = 0.05f;
    params.mix = 1.0f;
    params.renderMode = 1;
    params.dreamBypass = true;

    auto bypassParams = params;
    bypassParams.dopplerAmount = 0.0f;
    active.process (activeBuffer, params, true);
    bypassed.process (bypassedBuffer, bypassParams, true);

    auto delayedEnergy = 0.0f;
    for (int sample = 1; sample < probeBlockSize; ++sample)
        delayedEnergy = std::max (delayedEnergy, std::abs (activeBuffer.getSample (0, sample)));

    const auto firstSample = std::abs (activeBuffer.getSample (0, 0));
    const auto bypassSample = std::abs (bypassedBuffer.getSample (0, 0));
    if (! std::isfinite (firstSample) || ! std::isfinite (delayedEnergy)
        || bypassSample < 0.5f || firstSample > bypassSample * 0.8f || delayedEnergy < 0.05f)
    {
        std::cerr << "Doppler delay probe failed; first=" << firstSample
                  << " bypass=" << bypassSample << " delayed=" << delayedEnergy << "\n";
        return false;
    }

    return true;
}

bool checkRotatorAndDopplerAreIndependent (double sampleRate, int blockSize)
{
    if (blockSize <= 0)
        return true;

    const auto probeBlockSize = std::max (blockSize, 256);
    auto makeBuffer = [probeBlockSize]
    {
        auto buffer = juce::AudioBuffer<float> (2, probeBlockSize);
        for (int channel = 0; channel < 2; ++channel)
            for (int sample = 0; sample < probeBlockSize; ++sample)
                buffer.setSample (channel, sample,
                                  0.25f * std::sin (static_cast<float> (sample + channel * 13) * 0.19f));
        return buffer;
    };

    auto bothOff = makeBuffer();
    auto rotatorOnly = makeBuffer();
    auto dopplerOnly = makeBuffer();

    auto base = neutralParams();
    base.modelBypass = true;
    base.modelAmount = 0.0f;
    base.dreamBypass = true;
    base.speedMode = 3;
    base.freeRate = 6.5f;
    base.inertia = 0.05f;
    base.motion = 1.0f;
    base.depth = 1.0f;
    base.mix = 1.0f;
    base.renderMode = 1;

    auto offParams = base;
    offParams.rotatorAmount = 0.0f;
    offParams.dopplerAmount = 0.0f;
    auto rotatorParams = base;
    rotatorParams.rotatorAmount = 1.0f;
    rotatorParams.dopplerAmount = 0.0f;
    auto dopplerParams = base;
    dopplerParams.rotatorAmount = 0.0f;
    dopplerParams.dopplerAmount = 1.0f;

    openfad::RotatorDSP offDsp;
    openfad::RotatorDSP rotatorDsp;
    openfad::RotatorDSP dopplerDsp;
    offDsp.prepare (sampleRate, probeBlockSize, 2);
    rotatorDsp.prepare (sampleRate, probeBlockSize, 2);
    dopplerDsp.prepare (sampleRate, probeBlockSize, 2);
    auto expected = makeBuffer();
    offDsp.process (bothOff, offParams, true);
    rotatorDsp.process (rotatorOnly, rotatorParams, true);
    dopplerDsp.process (dopplerOnly, dopplerParams, true);

    const auto offDifference = bufferMaximumDifference (bothOff, expected);
    const auto rotatorDifference = bufferMaximumDifference (rotatorOnly, expected);
    const auto dopplerDifference = bufferMaximumDifference (dopplerOnly, expected);
    if (! std::isfinite (offDifference) || ! std::isfinite (rotatorDifference)
        || ! std::isfinite (dopplerDifference)
        || offDifference > 1.0e-5f
        || rotatorDifference < 1.0e-3f
        || dopplerDifference < 1.0e-3f)
    {
        std::cerr << "Rotator/Doppler independence failed; off=" << offDifference
                  << " rotator=" << rotatorDifference
                  << " doppler=" << dopplerDifference << "\n";
        return false;
    }

    return true;
}

bool checkDopplerAutomationIsContinuous (double sampleRate, int blockSize)
{
    if (blockSize <= 0)
        return true;

    constexpr auto probeBlockSize = 64;
    constexpr auto warmupBlocks = 48;
    constexpr auto transitionBlocks = 16;
    openfad::RotatorDSP dsp;
    dsp.prepare (sampleRate, probeBlockSize, 2);
    auto buffer = juce::AudioBuffer<float> (2, probeBlockSize);
    auto params = neutralParams();
    params.modelBypass = true;
    params.modelAmount = 0.0f;
    params.dreamBypass = true;
    params.speedMode = 0;
    params.rotatorAmount = 0.0f;
    params.dopplerAmount = 1.0f;
    params.depth = 1.0f;
    params.motion = 1.0f;
    params.mix = 1.0f;
    params.renderMode = 1;

    auto fill = [&buffer] (int offset)
    {
        for (int channel = 0; channel < 2; ++channel)
            for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
                buffer.setSample (channel, sample,
                                  0.75f * std::sin (static_cast<float> (offset + sample + channel * 7) * 0.65f));
    };

    for (int block = 0; block < warmupBlocks; ++block)
    {
        fill (block * probeBlockSize);
        dsp.process (buffer, params, true);
    }

    auto measureStep = [&buffer] (float& previous, bool& hasPrevious)
    {
        auto maximumStep = 0.0f;
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
        {
            const auto current = buffer.getSample (0, sample);
            if (hasPrevious)
                maximumStep = std::max (maximumStep, std::abs (current - previous));
            previous = current;
            hasPrevious = true;
        }
        return maximumStep;
    };

    auto previous = 0.0f;
    auto hasPrevious = false;
    fill (warmupBlocks * probeBlockSize);
    dsp.process (buffer, params, true);
    const auto baselineStep = measureStep (previous, hasPrevious);

    params.dopplerAmount = 0.0f;
    auto maximumTransitionStep = 0.0f;
    for (int block = 0; block < transitionBlocks; ++block)
    {
        fill ((warmupBlocks + 1 + block) * probeBlockSize);
        dsp.process (buffer, params, true);
        maximumTransitionStep = std::max (maximumTransitionStep,
                                          measureStep (previous, hasPrevious));
    }

    // A 24 ms smoother should keep a parameter jump below a full-scale sample
    // discontinuity, even with a deliberately bright high-frequency probe.
    if (! std::isfinite (baselineStep) || ! std::isfinite (maximumTransitionStep)
        || maximumTransitionStep > 0.85f)
    {
        std::cerr << "Doppler automation discontinuity; baseline=" << baselineStep
                  << " transition=" << maximumTransitionStep << "\n";
        return false;
    }

    return true;
}

bool checkSpeakerModelTransitionIsSmooth (double sampleRate, int blockSize)
{
    if (blockSize <= 0)
        return true;

    constexpr auto probeBlockSize = 64;
    constexpr auto warmupBlocks = 96;
    openfad::RotatorDSP transitioned;
    openfad::RotatorDSP reference;
    transitioned.prepare (sampleRate, probeBlockSize, 2);
    reference.prepare (sampleRate, probeBlockSize, 2);

    auto transitionBuffer = juce::AudioBuffer<float> (2, probeBlockSize);
    auto referenceBuffer = juce::AudioBuffer<float> (2, probeBlockSize);
    auto transitionedParams = neutralParams();
    transitionedParams.modelAmount = 1.0f;
    transitionedParams.model = 0;
    transitionedParams.character = 0.55f;
    transitionedParams.drive = 0.65f;
    transitionedParams.mix = 1.0f;
    transitionedParams.renderMode = 1;
    transitionedParams.feedMode = 1;
    auto referenceParams = transitionedParams;

    auto fill = [] (juce::AudioBuffer<float>& buffer, int offset)
    {
        for (int channel = 0; channel < 2; ++channel)
            for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
            {
                const auto sign = ((offset + sample) & 1) == 0 ? 1.0f : -1.0f;
                buffer.setSample (channel, sample, sign * 0.42f);
            }
    };

    auto previousTransitionSample = 0.0f;
    auto previousReferenceSample = 0.0f;
    for (int block = 0; block < warmupBlocks; ++block)
    {
        fill (transitionBuffer, block * probeBlockSize);
        fill (referenceBuffer, block * probeBlockSize);
        transitioned.process (transitionBuffer, transitionedParams, true);
        reference.process (referenceBuffer, referenceParams, true);
        previousTransitionSample = transitionBuffer.getSample (0, probeBlockSize - 1);
        previousReferenceSample = referenceBuffer.getSample (0, probeBlockSize - 1);
    }

    transitionedParams.model = 7;
    fill (transitionBuffer, warmupBlocks * probeBlockSize);
    fill (referenceBuffer, warmupBlocks * probeBlockSize);
    transitioned.process (transitionBuffer, transitionedParams, true);
    reference.process (referenceBuffer, referenceParams, true);

    const auto firstTransition = transitionBuffer.getSample (0, 0);
    const auto firstReference = referenceBuffer.getSample (0, 0);
    const auto firstError = std::abs (firstTransition - firstReference);
    const auto transitionStep = std::abs (firstTransition - previousTransitionSample);
    const auto referenceStep = std::abs (firstReference - previousReferenceSample);

    // A model change is a host-automatable discrete choice. The first sample
    // after the change should remain close to the uninterrupted reference;
    // the voicing ramp then takes over across the following milliseconds.
    if (! std::isfinite (firstError)
        || ! std::isfinite (transitionStep)
        || ! std::isfinite (referenceStep)
        || firstError > 0.12f
        || transitionStep > referenceStep + 0.12f)
    {
        std::cerr << "speaker model transition discontinuity; error=" << firstError
                  << " transitionStep=" << transitionStep
                  << " referenceStep=" << referenceStep << "\n";
        return false;
    }

    return true;
}

bool checkExtendedSpeakerVoicing()
{
    constexpr auto sampleRate = 48000.0;
    constexpr auto blockSize = 512;

    auto baseProfiles = openfad::RotatorDSP::defaultSpeakerProfiles();
    auto extendedProfiles = baseProfiles;
    auto& extended = extendedProfiles[1];
    extended.lowMidGain = 1.85f;
    extended.presenceGain = 0.62f;
    extended.airGain = 1.55f;

    openfad::RotatorDSP base;
    openfad::RotatorDSP extendedDsp;
    base.prepare (sampleRate, blockSize, 2);
    extendedDsp.prepare (sampleRate, blockSize, 2);
    base.setSpeakerProfiles (baseProfiles);
    extendedDsp.setSpeakerProfiles (extendedProfiles);

    auto baseBuffer = juce::AudioBuffer<float> (2, blockSize);
    auto extendedBuffer = juce::AudioBuffer<float> (2, blockSize);
    for (int channel = 0; channel < 2; ++channel)
        for (int sample = 0; sample < blockSize; ++sample)
        {
            const auto time = static_cast<float> (sample + channel * 19);
            const auto value = 0.24f * std::sin (time * 0.021f)
                             + 0.16f * std::sin (time * 0.17f)
                             + 0.08f * std::sin (time * 0.61f);
            baseBuffer.setSample (channel, sample, value);
            extendedBuffer.setSample (channel, sample, value);
        }

    auto params = neutralParams();
    params.model = 1;
    params.modelAmount = 1.0f;
    params.modelBypass = false;
    params.character = 0.45f;
    params.mix = 1.0f;
    base.process (baseBuffer, params, true);
    extendedDsp.process (extendedBuffer, params, true);

    const auto difference = bufferMaximumDifference (baseBuffer, extendedBuffer);
    if (! allFinite (baseBuffer) || ! allFinite (extendedBuffer)
        || ! std::isfinite (difference) || difference < 1.0e-3f)
    {
        std::cerr << "extended speaker voicing did not affect the output; difference="
                  << difference << "\n";
        return false;
    }

    return true;
}

bool checkBinauralSpatialCue (double sampleRate, int blockSize)
{
    if (blockSize <= 0)
        return true;

    constexpr auto probeBlockSize = 1024;
    openfad::RotatorDSP binaural;
    openfad::RotatorDSP speakerStereo;
    binaural.prepare (sampleRate, probeBlockSize, 2);
    speakerStereo.prepare (sampleRate, probeBlockSize, 2);

    auto binauralBuffer = juce::AudioBuffer<float> (2, probeBlockSize);
    auto speakerBuffer = juce::AudioBuffer<float> (2, probeBlockSize);
    auto binauralParams = neutralParams();
    binauralParams.renderMode = 0;
    binauralParams.angle = 40.0f;
    binauralParams.depth = 0.0f;
    binauralParams.mix = 1.0f;
    binauralParams.feedMode = 1;
    auto speakerParams = binauralParams;
    speakerParams.renderMode = 1;

    for (int sample = 0; sample < probeBlockSize; ++sample)
    {
        const auto value = 0.22f * std::sin (static_cast<float> (sample) * 0.19f)
                         + 0.08f * std::sin (static_cast<float> (sample) * 0.47f);
        binauralBuffer.setSample (0, sample, value);
        binauralBuffer.setSample (1, sample, 0.0f);
        speakerBuffer.setSample (0, sample, value);
        speakerBuffer.setSample (1, sample, 0.0f);
    }

    binaural.process (binauralBuffer, binauralParams, true);
    speakerStereo.process (speakerBuffer, speakerParams, true);
    if (! allFinite (binauralBuffer) || ! allFinite (speakerBuffer))
        return false;

    auto maximumDifference = 0.0f;
    auto binauralRightEnergy = 0.0f;
    for (int sample = 0; sample < probeBlockSize; ++sample)
    {
        maximumDifference = std::max (maximumDifference,
                                      std::abs (binauralBuffer.getSample (0, sample)
                                                - speakerBuffer.getSample (0, sample)));
        maximumDifference = std::max (maximumDifference,
                                      std::abs (binauralBuffer.getSample (1, sample)
                                                - speakerBuffer.getSample (1, sample)));
        binauralRightEnergy = std::max (binauralRightEnergy,
                                        std::abs (binauralBuffer.getSample (1, sample)));
    }

    if (! std::isfinite (maximumDifference)
        || ! std::isfinite (binauralRightEnergy)
        || maximumDifference < 0.005f
        || binauralRightEnergy < 0.0005f)
    {
        std::cerr << "Binaural spatial cue missing; difference=" << maximumDifference
                  << " rightEnergy=" << binauralRightEnergy << "\n";
        return false;
    }

    return true;
}

bool checkBinauralImpulseHasPinnaTail()
{
    constexpr auto sampleRate = 48000.0;
    constexpr auto blockSize = 256;
    openfad::RotatorDSP dsp;
    dsp.prepare (sampleRate, blockSize, 2);

    auto buffer = juce::AudioBuffer<float> (2, blockSize);
    buffer.clear();
    buffer.setSample (0, 0, 1.0f);

    auto params = neutralParams();
    params.renderMode = 0;
    params.modelBypass = true;
    params.modelAmount = 0.0f;
    params.rotatorAmount = 0.0f;
    params.dopplerAmount = 0.0f;
    params.dreamBypass = true;
    params.earlyReflections = 0.0f;
    params.angle = 32.0f;
    params.mix = 1.0f;

    dsp.process (buffer, params, true);
    if (! allFinite (buffer))
        return false;

    auto nonZeroSamples = 0;
    for (int sample = 0; sample < blockSize; ++sample)
        if (std::abs (buffer.getSample (0, sample)) > 1.0e-5f)
            ++nonZeroSamples;

    if (nonZeroSamples < 4)
    {
        std::cerr << "binaural pinna tail was too short; non-zero samples="
                  << nonZeroSamples << "\n";
        return false;
    }

    return true;
}

bool checkBinauralAngleAutomationIsContinuous (double sampleRate, int blockSize)
{
    if (blockSize <= 0)
        return true;

    constexpr auto probeBlockSize = 64;
    constexpr auto warmupBlocks = 64;
    constexpr auto transitionBlocks = 48;
    openfad::RotatorDSP dsp;
    dsp.prepare (sampleRate, probeBlockSize, 2);
    auto buffer = juce::AudioBuffer<float> (2, probeBlockSize);
    auto params = neutralParams();
    params.renderMode = 0;
    params.angle = -40.0f;
    params.depth = 0.0f;
    params.mix = 1.0f;
    params.feedMode = 1;

    auto fill = [&buffer] (int offset)
    {
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
        {
            const auto value = 0.28f * std::sin (static_cast<float> (offset + sample) * 0.71f);
            buffer.setSample (0, sample, value);
            buffer.setSample (1, sample, 0.0f);
        }
    };

    for (int block = 0; block < warmupBlocks; ++block)
    {
        fill (block * probeBlockSize);
        dsp.process (buffer, params, true);
    }

    params.angle = 40.0f;
    auto previous = buffer.getSample (0, probeBlockSize - 1);
    auto maximumStep = 0.0f;
    for (int block = 0; block < transitionBlocks; ++block)
    {
        fill ((warmupBlocks + block) * probeBlockSize);
        dsp.process (buffer, params, true);
        for (int sample = 0; sample < probeBlockSize; ++sample)
        {
            const auto current = buffer.getSample (0, sample);
            maximumStep = std::max (maximumStep, std::abs (current - previous));
            previous = current;
        }
    }

    if (! std::isfinite (maximumStep) || maximumStep > 0.85f)
    {
        std::cerr << "Binaural angle automation discontinuity; maxStep=" << maximumStep << "\n";
        return false;
    }

    return true;
}

bool checkDiscreteTransitionsAreContinuous (double sampleRate, int blockSize)
{
    if (blockSize <= 0)
        return true;

    constexpr auto probeBlockSize = 64;
    constexpr auto warmupBlocks = 96;
    constexpr auto transitionBlocks = 48;

    auto measure = [sampleRate] (openfad::RotatorDSP::Params start,
                                 openfad::RotatorDSP::Params end,
                                 const char* label)
    {
        openfad::RotatorDSP dsp;
        dsp.prepare (sampleRate, probeBlockSize, 2);
        auto buffer = juce::AudioBuffer<float> (2, probeBlockSize);

        auto fill = [&buffer] (int offset)
        {
            for (int channel = 0; channel < 2; ++channel)
                for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
                {
                    const auto time = static_cast<float> (offset + sample + channel * 11);
                    buffer.setSample (channel, sample,
                                      0.28f * std::sin (time * 0.61f)
                                      + 0.14f * std::sin (time * 0.17f));
                }
        };

        for (int block = 0; block < warmupBlocks; ++block)
        {
            fill (block * probeBlockSize);
            dsp.process (buffer, start, true);
        }

        auto previous = buffer.getSample (0, probeBlockSize - 1);
        auto maximumStep = 0.0f;
        for (int block = 0; block < transitionBlocks; ++block)
        {
            fill ((warmupBlocks + block) * probeBlockSize);
            dsp.process (buffer, end, true);
            for (int sample = 0; sample < probeBlockSize; ++sample)
            {
                const auto current = buffer.getSample (0, sample);
                maximumStep = std::max (maximumStep, std::abs (current - previous));
                previous = current;
            }
        }

        if (! std::isfinite (maximumStep) || maximumStep > 0.85f)
        {
            std::cerr << label << " discontinuity; maxStep=" << maximumStep << "\n";
            return false;
        }

        return true;
    };

    auto base = activeParams();
    base.mix = 1.0f;
    base.modelAmount = 1.0f;
    base.rotatorAmount = 1.0f;
    base.dopplerAmount = 1.0f;
    base.dreamBypass = false;
    base.dream = 0.9f;
    base.feedback = 0.86f;
    base.predelay = 0.025f;
    base.tail = 6.0f;
    base.renderMode = 1;
    base.angle = 35.0f;
    base.depth = 1.0f;
    base.motion = 0.9f;
    base.space = 0.85f;
    base.inertia = 0.05f;

    auto binaural = base;
    binaural.renderMode = 0;
    auto modelBypassed = base;
    modelBypassed.modelBypass = true;
    auto dreamBypassed = base;
    dreamBypassed.dreamBypass = true;
    auto frozen = base;
    frozen.freeze = true;

    return measure (base, binaural, "render mode")
        && measure (binaural, base, "render mode reverse")
        && measure (base, modelBypassed, "model bypass")
        && measure (modelBypassed, base, "model bypass reverse")
        && measure (base, dreamBypassed, "dream bypass")
        && measure (dreamBypassed, base, "dream bypass reverse")
        && measure (base, frozen, "dream freeze")
        && measure (frozen, base, "dream freeze reverse");
}

bool checkSyncDivisionRates()
{
    constexpr double sampleRate = 48000.0;
    constexpr int blockSize = 64;
    constexpr int warmupBlocks = 1000;
    constexpr float motionRateScale = 0.8f; // motion = 0.5
    constexpr std::array<float, 9> expectedRates {
        16.0f, 8.0f, 4.0f, 2.0f, 1.0f, 0.5f, 0.25f, 0.125f, 0.0625f
    };

    auto buffer = juce::AudioBuffer<float> (2, blockSize);
    buffer.clear();
    for (size_t division = 0; division < expectedRates.size(); ++division)
    {
        openfad::RotatorDSP dsp;
        dsp.prepare (sampleRate, blockSize, 2);
        auto params = neutralParams();
        params.speedMode = 4;
        params.syncDivision = static_cast<int> (division);
        params.bpm = 120.0;
        params.motion = 0.5f;
        params.inertia = 0.05f;

        for (int block = 0; block < warmupBlocks; ++block)
            dsp.process (buffer, params, true);

        const auto actual = dsp.getTelemetrySnapshot().rotorRate;
        const auto expected = expectedRates[division] * motionRateScale;
        const auto tolerance = std::max (0.01f, expected * 0.05f);
        if (! std::isfinite (actual) || std::abs (actual - expected) > tolerance)
        {
            std::cerr << "sync division rate mismatch index=" << division
                      << " expected=" << expected << " actual=" << actual << "\n";
            return false;
        }
    }

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
        && std::isfinite (snapshot.rotorSignedRate)
        && std::isfinite (snapshot.inputPeak)
        && std::isfinite (snapshot.outputPeak)
        && std::isfinite (snapshot.bandEnergy[0])
        && std::isfinite (snapshot.bandEnergy[1])
        && std::isfinite (snapshot.bandEnergy[2]);
}
}

int main()
{
    const std::vector<double> sampleRates { 44100.0, 48000.0, 88200.0, 96000.0, 192000.0 };
    const std::vector<int> blockSizes { 0, 1, 7, 31, 127, 128, 511, 1024 };

    for (const auto sampleRate : sampleRates)
        for (const auto blockSize : blockSizes)
        {
            if (! checkNeutrality (sampleRate, blockSize)
                || ! checkActiveFinite (sampleRate, blockSize)
                || ! checkActiveOutputChanges (sampleRate, blockSize)
                || ! checkDirectionTransitionIsSmooth (sampleRate, blockSize)
                || ! checkDirectionTransitionAudioContinuity (sampleRate, blockSize)
                || ! checkDopplerDelayIsPresent (sampleRate, blockSize)
                || ! checkRotatorAndDopplerAreIndependent (sampleRate, blockSize)
                || ! checkDopplerAutomationIsContinuous (sampleRate, blockSize)
                || ! checkSpeakerModelTransitionIsSmooth (sampleRate, blockSize)
                || ! checkExtendedSpeakerVoicing()
                || ! checkBinauralSpatialCue (sampleRate, blockSize)
                || ! checkBinauralImpulseHasPinnaTail()
                || ! checkBinauralAngleAutomationIsContinuous (sampleRate, blockSize))
            {
                std::cerr << "DSP regression failed at " << sampleRate << " Hz / " << blockSize << " samples\n";
                return 1;
            }
        }

    for (const auto sampleRate : sampleRates)
        if (! checkDiscreteTransitionsAreContinuous (sampleRate, 64))
        {
            std::cerr << "DSP regression failed discrete transition checks at "
                      << sampleRate << " Hz\n";
            return 1;
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

    if (! checkSyncDivisionRates())
    {
        std::cerr << "DSP regression failed sync division rate mapping\n";
        return 1;
    }

    std::cout << "RotatorDSP tests passed\n";
    return 0;
}
