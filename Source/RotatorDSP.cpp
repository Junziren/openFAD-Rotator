#include "RotatorDSP.h"

#include <algorithm>
#include <cmath>

namespace openfad
{
namespace
{
constexpr float pi = 3.14159265358979323846f;
constexpr float twoPi = 2.0f * pi;

float clamp01 (float value) noexcept
{
    return std::clamp (value, 0.0f, 1.0f);
}

float softClip (float value, float drive) noexcept
{
    const auto amount = 1.0f + 8.0f * clamp01 (drive);
    return std::tanh (value * amount) / std::tanh (amount);
}

float onePoleLowpass (float input, float& state, float coefficient) noexcept
{
    const auto safeCoefficient = std::clamp (coefficient, 0.0f, 0.9999f);
    state += safeCoefficient * (input - state);
    return state;
}

template <typename T>
T finiteClamp (T value, T fallback, T minimum, T maximum) noexcept
{
    return std::isfinite (value) ? std::clamp (value, minimum, maximum) : fallback;
}

RotatorDSP::Params sanitiseParams (RotatorDSP::Params params) noexcept
{
    params.inputTrimDb = finiteClamp (params.inputTrimDb, 0.0f, -24.0f, 24.0f);
    params.outputTrimDb = finiteClamp (params.outputTrimDb, 0.0f, -24.0f, 12.0f);
    params.mix = finiteClamp (params.mix, 0.35f, 0.0f, 1.0f);
    params.quality = std::clamp (params.quality, 0, 1);
    params.model = std::clamp (params.model, 0, 7);
    params.drive = finiteClamp (params.drive, 0.2f, 0.0f, 1.0f);
    params.resonance = finiteClamp (params.resonance, 0.35f, 0.0f, 1.0f);
    params.damping = finiteClamp (params.damping, 0.5f, 0.0f, 1.0f);
    params.structure = std::clamp (params.structure, 0, 2);
    params.feedMode = std::clamp (params.feedMode, 0, 2);
    params.renderMode = std::clamp (params.renderMode, 0, 1);
    params.speedMode = std::clamp (params.speedMode, 0, 4);
    params.freeRate = finiteClamp (params.freeRate, 0.8f, 0.02f, 20.0f);
    params.syncDivision = std::clamp (params.syncDivision, 0, 8);
    params.inertia = finiteClamp (params.inertia, 2.2f, 0.05f, 12.0f);
    params.direction = std::clamp (params.direction, 0, 1);
    params.depth = finiteClamp (params.depth, 0.75f, 0.0f, 1.0f);
    params.distance = finiteClamp (params.distance, 1.2f, 0.5f, 3.0f);
    params.angle = finiteClamp (params.angle, 0.0f, -45.0f, 45.0f);
    params.earlyReflections = finiteClamp (params.earlyReflections, 0.25f, 0.0f, 1.0f);
    params.roomDamping = finiteClamp (params.roomDamping, 0.55f, 0.0f, 1.0f);
    params.modelAmount = finiteClamp (params.modelAmount, 1.0f, 0.0f, 1.0f);
    params.rotatorAmount = finiteClamp (params.rotatorAmount, 1.0f, 0.0f, 1.0f);
    params.predelay = finiteClamp (params.predelay, 0.035f, 0.0f, 0.25f);
    params.diffusion = finiteClamp (params.diffusion, 0.45f, 0.0f, 1.0f);
    params.tail = finiteClamp (params.tail, 3.5f, 0.2f, 12.0f);
    params.microshift = finiteClamp (params.microshift, 8.0f, 0.0f, 25.0f);
    params.dreamDamping = finiteClamp (params.dreamDamping, 0.35f, 0.0f, 1.0f);
    params.feedback = finiteClamp (params.feedback, 0.58f, 0.0f, 0.96f);
    params.character = finiteClamp (params.character, 0.35f, 0.0f, 1.0f);
    params.motion = finiteClamp (params.motion, 0.35f, 0.0f, 1.0f);
    params.space = finiteClamp (params.space, 0.3f, 0.0f, 1.0f);
    params.dream = finiteClamp (params.dream, 0.25f, 0.0f, 1.0f);
    params.bpm = finiteClamp (params.bpm, 120.0, 20.0, 300.0);
    return params;
}
}

RotatorDSP::SpeakerProfiles RotatorDSP::defaultSpeakerProfiles() noexcept
{
    return {{
        { 0.015f, 0.24f, 1.18f, 1.22f, 0.66f },
        { 0.009f, 0.35f, 1.08f, 1.08f, 0.94f },
        { 0.012f, 0.42f, 1.24f, 0.96f, 1.18f },
        { 0.006f, 0.38f, 1.04f, 1.12f, 0.88f },
        { 0.004f, 0.48f, 1.12f, 1.02f, 1.12f },
        { 0.002f, 0.62f, 0.98f, 1.00f, 1.26f },
        { 0.020f, 0.31f, 1.30f, 0.90f, 0.72f },
        { 0.001f, 0.80f, 1.00f, 1.04f, 1.16f }
    }};
}

void RotatorDSP::prepare (double newSampleRate, int, int newNumChannels)
{
    sampleRate = std::max (std::isfinite (newSampleRate) ? newSampleRate : 44100.0, 1.0);
    numChannels = std::clamp (newNumChannels, 1, 2);
    const auto delayLength = static_cast<size_t> (std::ceil (sampleRate * 12.5)) + 8u;
    delayLeft.assign (delayLength, 0.0f);
    delayRight.assign (delayLength, 0.0f);
    inputGainSmoother.reset (sampleRate, 0.012);
    outputGainSmoother.reset (sampleRate, 0.012);
    mixSmoother.reset (sampleRate, 0.012);
    smoothersInitialised = false;
    reset();
}

void RotatorDSP::reset()
{
    rotorPhase = 0.0f;
    rotorRate = 0.0f;
    targetRotorRate = 0.0f;
    inputPeak = 0.0f;
    outputPeak = 0.0f;
    bandEnergy = { 0.0f, 0.0f, 0.0f };
    telemetryRotorPhase.store (0.0f, std::memory_order_relaxed);
    telemetrySequence.store (0u, std::memory_order_release);
    telemetryRotorRate.store (0.0f, std::memory_order_relaxed);
    telemetryInputPeak.store (0.0f, std::memory_order_relaxed);
    telemetryOutputPeak.store (0.0f, std::memory_order_relaxed);
    telemetryBand0.store (0.0f, std::memory_order_relaxed);
    telemetryBand1.store (0.0f, std::memory_order_relaxed);
    telemetryBand2.store (0.0f, std::memory_order_relaxed);
    delayWrite = 0;
    std::fill (delayLeft.begin(), delayLeft.end(), 0.0f);
    std::fill (delayRight.begin(), delayRight.end(), 0.0f);
    inputGainSmoother.setCurrentAndTargetValue (0.0f);
    outputGainSmoother.setCurrentAndTargetValue (0.0f);
    mixSmoother.setCurrentAndTargetValue (0.0f);
    smoothersInitialised = false;
    for (auto& state : channelStates)
        state = {};
}

float RotatorDSP::currentRateForParams (const Params& params) const noexcept
{
    switch (params.speedMode)
    {
        case 0: return 0.0f;
        case 1: return 0.8f;
        case 2: return 6.5f;
        case 3: return std::clamp (params.freeRate, 0.02f, 20.0f);
        case 4:
        {
            static constexpr std::array<float, 9> divisions {
                8.0f, 4.0f, 2.0f, 1.0f, 0.5f, 0.25f, 0.125f, 0.0625f, 0.03125f
            };
            const auto division = divisions[static_cast<size_t> (std::clamp (params.syncDivision, 0, 8))];
            return static_cast<float> (std::clamp (params.bpm, 20.0, 300.0) / 60.0 * division);
        }
        default: return 0.8f;
    }
}

float RotatorDSP::modelGain (int model) const noexcept
{
    static constexpr std::array<float, 8> gains { 0.84f, 0.94f, 0.78f, 0.96f, 0.93f, 1.0f, 0.86f, 1.02f };
    return gains[static_cast<size_t> (std::clamp (model, 0, 7))];
}

float RotatorDSP::modelLowCut (int model) const noexcept
{
    return speakerProfiles[static_cast<size_t> (std::clamp (model, 0, 7))].lowCut;
}

float RotatorDSP::modelHighCut (int model) const noexcept
{
    return speakerProfiles[static_cast<size_t> (std::clamp (model, 0, 7))].highCut;
}

float RotatorDSP::modelLowGain (int model) const noexcept
{
    return speakerProfiles[static_cast<size_t> (std::clamp (model, 0, 7))].lowGain;
}

float RotatorDSP::modelMidGain (int model) const noexcept
{
    return speakerProfiles[static_cast<size_t> (std::clamp (model, 0, 7))].midGain;
}

float RotatorDSP::modelHighGain (int model) const noexcept
{
    return speakerProfiles[static_cast<size_t> (std::clamp (model, 0, 7))].highGain;
}

float RotatorDSP::processSpeaker (float input, ChannelState& state, const Params& params)
{
    const auto model = std::clamp (params.model, 0, 7);
    const auto qualityFactor = params.quality == 1 ? 1.35f : 1.0f;
    auto low = onePoleLowpass (input, state.low, modelLowCut (model) * qualityFactor);
    auto high = input - onePoleLowpass (input, state.high, modelHighCut (model) / qualityFactor);
    if (params.quality == 1)
    {
        low = onePoleLowpass (low, state.low, modelLowCut (model) * 0.55f);
        high = input - onePoleLowpass (input - high, state.high, modelHighCut (model) * 0.65f);
    }
    const auto mid = input - low - high;
    const auto resonance = 0.65f + 0.6f * params.resonance;
    const auto cabinetCoefficient = (0.06f + 0.15f * (1.0f - params.damping))
                                  * (params.quality == 1 ? 0.72f : 1.0f);
    const auto cabinet = onePoleLowpass (mid * resonance, state.cabinet, cabinetCoefficient);
    const auto shaped = (low * modelLowGain (model)
                       + mid * modelMidGain (model)
                       + cabinet * (0.32f + 0.18f * params.resonance)
                       + high * modelHighGain (model));
    const auto drive = params.modelBypass ? 0.0f : params.drive * (0.35f + 0.08f * static_cast<float> (model));
    const auto calibratedGain = params.loudnessMatch ? modelGain (model) : 1.0f;
    return params.modelBypass ? input : softClip (shaped * calibratedGain, drive);
}

float RotatorDSP::processDream (float input, ChannelState& state, int channel, const Params& params)
{
    if (params.dreamBypass || params.dream <= 0.0001f)
        return input;

    auto& delay = channel == 0 ? delayLeft : delayRight;
    if (delay.empty())
        return input;

    auto predelaySeconds = std::clamp (params.predelay, 0.0f, 0.25f);
    if (params.predelaySync)
    {
        static constexpr std::array<float, 9> beatMultipliers {
            0.125f, 0.25f, 0.5f, 1.0f, 2.0f, 4.0f, 8.0f, 16.0f, 32.0f
        };
        const auto index = static_cast<size_t> (std::clamp (params.syncDivision, 0, 8));
        predelaySeconds = std::clamp (static_cast<float> (60.0 / std::clamp (params.bpm, 20.0, 300.0))
                                      * beatMultipliers[index], 0.0f, 0.25f);
    }

    const auto delaySamples = static_cast<size_t> (predelaySeconds * sampleRate);
    const auto tailOffset = static_cast<size_t> (std::clamp (params.tail, 0.2f, 12.0f)
                                                  * static_cast<float> (sampleRate) * 0.12f);
    const auto readOffset = std::min (delaySamples, delay.size() - 1u);
    const auto tailReadOffset = std::min (readOffset + tailOffset, delay.size() - 1u);
    const auto readIndex = (delayWrite + delay.size() - readOffset) % delay.size();
    const auto tailReadIndex = (delayWrite + delay.size() - tailReadOffset) % delay.size();
    const auto delayed = delay[readIndex] * 0.72f + delay[tailReadIndex] * 0.28f;
    auto& diffusion = state.diffusion;
    auto diffuse = delayed;
    for (size_t i = 0; i < diffusion.size(); ++i)
    {
        const auto polarity = (i & 1u) == 0u ? 1.0f : -1.0f;
        const auto diffusionRate = (0.02f + 0.12f * params.diffusion)
                                  * (params.quality == 1 ? 1.25f : 1.0f);
        diffusion[i] += (diffuse * polarity - diffusion[i]) * diffusionRate;
        diffuse = diffuse * (params.quality == 1 ? 0.72f : 0.78f) + diffusion[i] * 0.28f;
    }

    const auto freezeInput = params.freeze ? 0.0f : input;
    const auto tailFactor = std::clamp (0.55f + 0.45f * (params.tail / 12.0f), 0.0f, 1.0f);
    const auto feedback = params.freeze
        ? 0.9995f
        : std::clamp (params.feedback * (0.65f + params.dream * 0.3f) * (0.75f + 0.25f * tailFactor),
                      0.0f, 0.97f);
    const auto damping = params.freeze
        ? 1.0f
        : std::clamp (0.9992f - 0.00065f * std::clamp (params.dreamDamping, 0.0f, 1.0f)
                      - 0.00025f * (1.0f - tailFactor), 0.97f, 0.9995f);
    const auto write = softClip (freezeInput + diffuse * feedback, 0.05f) * damping;
    delay[delayWrite] = write;

    state.dreamLow += (diffuse - state.dreamLow) * 0.015f;
    state.dreamHigh += (diffuse - state.dreamHigh) * 0.08f;
    const auto warm = state.dreamLow * 0.55f + (diffuse - state.dreamHigh) * 0.22f;
    const auto shifted = channel == 0 ? warm * (1.0f + params.microshift * 0.002f)
                                      : warm * (1.0f - params.microshift * 0.002f);
    return input + shifted * (0.18f + params.dream * 0.72f);
}

void RotatorDSP::process (juce::AudioBuffer<float>& buffer, const Params& rawParams, bool isPlaying)
{
    juce::ignoreUnused (isPlaying);
    const auto params = sanitiseParams (rawParams);
    const auto samples = buffer.getNumSamples();
    const auto channels = std::min (buffer.getNumChannels(), numChannels);
    if (channels <= 0 || samples <= 0 || delayLeft.empty())
        return;

    const auto inputGainTarget = juce::Decibels::decibelsToGain (params.inputTrimDb);
    const auto outputGainTarget = juce::Decibels::decibelsToGain (params.outputTrimDb);
    const auto mixTarget = params.bypass ? 0.0f : clamp01 (params.mix);
    if (! smoothersInitialised)
    {
        inputGainSmoother.setCurrentAndTargetValue (inputGainTarget);
        outputGainSmoother.setCurrentAndTargetValue (outputGainTarget);
        mixSmoother.setCurrentAndTargetValue (mixTarget);
        smoothersInitialised = true;
    }
    else
    {
        inputGainSmoother.setTargetValue (inputGainTarget);
        outputGainSmoother.setTargetValue (outputGainTarget);
        mixSmoother.setTargetValue (mixTarget);
    }
    targetRotorRate = currentRateForParams (params) * (0.35f + params.motion * 0.9f);
    const auto acceleration = 1.0f / (std::max (0.01f, params.inertia) * static_cast<float> (sampleRate));
    const auto direction = params.direction == 0 ? 1.0f : -1.0f;
    const auto rotorAmount = params.rotatorAmount * params.depth * (0.35f + params.motion * 0.9f);
    const auto modelAmount = params.modelBypass ? 0.0f : params.modelAmount * (0.6f + params.character * 0.7f);
    const auto spaceAmount = 0.12f + params.space * 0.88f;
    const auto outputSafetyClip = ! params.bypass
                               && (modelAmount > 0.000001f
                                   || rotorAmount > 0.000001f
                                   || (! params.dreamBypass && params.dream > 0.0001f)
                                   || params.earlyReflections > 0.000001f
                                   || params.renderMode == 0);

    const auto delaySize = delayLeft.size();
    for (int sample = 0; sample < samples; ++sample)
    {
        const auto inputGain = inputGainSmoother.getNextValue();
        const auto outputGain = outputGainSmoother.getNextValue();
        const auto rawLeft = buffer.getSample (0, sample);
        const auto rawRight = channels > 1 ? buffer.getSample (1, sample) : rawLeft;
        const auto leftIn = std::isfinite (rawLeft) ? rawLeft * inputGain : 0.0f;
        const auto rightIn = std::isfinite (rawRight) ? rawRight * inputGain : leftIn;
        const auto mono = params.feedMode == 0 ? (leftIn + rightIn) * 0.5f : leftIn;
        const auto sourceLeft = params.feedMode == 0 ? mono : leftIn;
        const auto sourceRight = params.feedMode == 0 ? mono : rightIn;

        const auto speakerLeft = processSpeaker (sourceLeft, channelStates[0], params) * modelAmount
                               + sourceLeft * (1.0f - modelAmount);
        const auto speakerRight = processSpeaker (sourceRight, channelStates[1], params) * modelAmount
                                + sourceRight * (1.0f - modelAmount);

        rotorRate += std::clamp (targetRotorRate - rotorRate, -acceleration * 8.0f, acceleration * 8.0f);
        rotorPhase += twoPi * rotorRate / static_cast<float> (sampleRate) * direction;
        if (rotorPhase >= twoPi || rotorPhase < 0.0f)
        {
            rotorPhase = std::fmod (rotorPhase, twoPi);
            if (rotorPhase < 0.0f)
                rotorPhase += twoPi;
        }

        const auto structure = std::clamp (params.structure, 0, 2);
        const auto structureBias = static_cast<float> (structure) * 0.23f;
        const auto rightPhase = params.feedMode == 2
            ? rotorPhase * 1.17f + 0.37f + structureBias
            : rotorPhase + pi + structureBias;
        const auto leftSine = std::sin (rotorPhase + structureBias);
        const auto rightSine = std::sin (rightPhase);
        const auto leftMotion = structure == 0
            ? 0.5f + 0.5f * leftSine
            : structure == 1
                ? 0.5f + 0.35f * leftSine + 0.15f * std::sin (2.0f * rotorPhase + 0.4f)
                : 0.5f + 0.5f * std::sin (rotorPhase + structureBias) * std::cos (rotorPhase * 0.5f);
        const auto rightMotion = structure == 0
            ? 0.5f + 0.5f * rightSine
            : structure == 1
                ? 0.5f + 0.35f * rightSine + 0.15f * std::sin (2.0f * rightPhase + 0.4f)
                : 0.5f + 0.5f * std::sin (rightPhase) * std::cos (rightPhase * 0.5f);
        const auto distanceGain = 1.0f / (0.75f + std::max (params.distance, 0.5f) * 0.25f);
        const auto anglePan = std::sin (params.angle * pi / 180.0f) * 0.28f * spaceAmount;
        const auto leftGain = distanceGain * (1.0f - anglePan) * (1.0f - 0.3f * rotorAmount * leftMotion);
        const auto rightGain = distanceGain * (1.0f + anglePan) * (1.0f - 0.3f * rotorAmount * rightMotion);

        auto wetLeft = speakerLeft * (1.0f - rotorAmount * 0.35f + rotorAmount * leftMotion * 0.7f) * leftGain;
        auto wetRight = speakerRight * (1.0f - rotorAmount * 0.35f + rotorAmount * rightMotion * 0.7f) * rightGain;
        const auto reflection = params.earlyReflections * (0.02f + 0.06f * spaceAmount);
        wetLeft += channelStates[0].reflection * reflection;
        wetRight += channelStates[1].reflection * reflection;
        const auto reflectionCoefficient = 0.01f + 0.12f * (1.0f - clamp01 (params.roomDamping));
        channelStates[0].reflection += (wetLeft - channelStates[0].reflection) * reflectionCoefficient;
        channelStates[1].reflection += (wetRight - channelStates[1].reflection) * reflectionCoefficient;

        if (params.renderMode == 0)
        {
            const auto headShadow = 0.08f + std::abs (std::sin (params.angle * pi / 180.0f)) * 0.22f;
            const auto crossfeed = 0.08f + params.space * 0.12f;
            channelStates[0].hrtfShadow += (wetLeft - channelStates[0].hrtfShadow)
                                          * (0.012f + 0.04f * headShadow);
            channelStates[1].hrtfShadow += (wetRight - channelStates[1].hrtfShadow)
                                           * (0.012f + 0.04f * headShadow);
            channelStates[0].hrtfCrossfeed += (wetRight - channelStates[0].hrtfCrossfeed)
                                             * (0.02f + 0.08f * crossfeed);
            channelStates[1].hrtfCrossfeed += (wetLeft - channelStates[1].hrtfCrossfeed)
                                             * (0.02f + 0.08f * crossfeed);
            const auto binauralLeft = (wetLeft - channelStates[0].hrtfShadow * headShadow)
                                     + channelStates[0].hrtfCrossfeed * crossfeed;
            const auto binauralRight = (wetRight - channelStates[1].hrtfShadow * headShadow)
                                      + channelStates[1].hrtfCrossfeed * crossfeed;
            wetLeft = binauralLeft;
            wetRight = binauralRight;
        }

        wetLeft = processDream (wetLeft, channelStates[0], 0, params);
        wetRight = processDream (wetRight, channelStates[1], 1, params);

        const auto mix = clamp01 (mixSmoother.getNextValue());
        const auto dryMix = std::sqrt (1.0f - mix);
        const auto wetMix = std::sqrt (mix);
        auto outLeft = (leftIn * dryMix + wetLeft * wetMix) * outputGain;
        auto outRight = (rightIn * dryMix + wetRight * wetMix) * outputGain;
        if (outputSafetyClip && mix > 0.000001f)
        {
            outLeft = softClip (outLeft, 0.02f);
            outRight = softClip (outRight, 0.02f);
        }

        outLeft = std::isfinite (outLeft) ? std::clamp (outLeft, -0.999f, 0.999f) : 0.0f;
        outRight = std::isfinite (outRight) ? std::clamp (outRight, -0.999f, 0.999f) : 0.0f;

        buffer.setSample (0, sample, outLeft);
        if (channels > 1)
            buffer.setSample (1, sample, outRight);


        inputPeak = std::max (inputPeak * 0.9992f, std::max (std::abs (leftIn), std::abs (rightIn)));
        outputPeak = std::max (outputPeak * 0.9992f, std::max (std::abs (outLeft), std::abs (outRight)));
        bandEnergy[0] = bandEnergy[0] * 0.995f + std::abs (wetLeft + wetRight) * 0.002f;
        bandEnergy[1] = bandEnergy[1] * 0.995f + std::abs (wetLeft - wetRight) * 0.002f;
        bandEnergy[2] = bandEnergy[2] * 0.995f + std::abs (wetLeft * leftMotion + wetRight * rightMotion) * 0.002f;

        // The delay line must advance in Standalone and when the host has no PlayHead.
        if (++delayWrite >= delaySize)
            delayWrite = 0;
    }

    // Publish a bounded snapshot for the message thread. The processing state
    // above remains audio-thread owned; editor telemetry only reads atomics.
    telemetrySequence.fetch_add (1u, std::memory_order_release);
    telemetryRotorPhase.store (std::isfinite (rotorPhase) ? rotorPhase : 0.0f, std::memory_order_relaxed);
    telemetryRotorRate.store (std::isfinite (rotorRate) ? rotorRate : 0.0f, std::memory_order_relaxed);
    telemetryInputPeak.store (std::isfinite (inputPeak) ? inputPeak : 0.0f, std::memory_order_relaxed);
    telemetryOutputPeak.store (std::isfinite (outputPeak) ? outputPeak : 0.0f, std::memory_order_relaxed);
    telemetryBand0.store (std::isfinite (bandEnergy[0]) ? bandEnergy[0] : 0.0f, std::memory_order_relaxed);
    telemetryBand1.store (std::isfinite (bandEnergy[1]) ? bandEnergy[1] : 0.0f, std::memory_order_relaxed);
    telemetryBand2.store (std::isfinite (bandEnergy[2]) ? bandEnergy[2] : 0.0f, std::memory_order_relaxed);
    telemetrySequence.fetch_add (1u, std::memory_order_release);
}
} // namespace openfad
