#include "RotatorDSP.h"

#include <algorithm>
#include <cmath>

namespace openfad
{
namespace
{
constexpr float pi = 3.14159265358979323846f;
constexpr float twoPi = 2.0f * pi;
constexpr float speedOfSound = 343.0f;
constexpr float drumRadiusMeters = 0.20f;
constexpr float hornRadiusMeters = 0.12f;
constexpr float drumRateRatio = 0.46f;
constexpr float maxBinauralItdSeconds = 0.00055f;

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

float speakerModelAmount (const RotatorDSP::Params& params) noexcept
{
    return params.modelBypass
        ? 0.0f
        : clamp01 (params.modelAmount * (0.6f + params.character * 0.7f));
}

float speakerDrive (const RotatorDSP::Params& params) noexcept
{
    return params.drive * (0.35f + 0.08f * static_cast<float> (std::clamp (params.model, 0, 7)));
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
    params.dopplerAmount = finiteClamp (params.dopplerAmount, 1.0f, 0.0f, 1.0f);
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
        { 0.015f, 0.24f, 1.18f, 1.22f, 0.66f, 1.32f, 1.18f, 0.72f },
        { 0.009f, 0.35f, 1.08f, 1.08f, 0.94f, 1.15f, 1.06f, 0.92f },
        { 0.012f, 0.42f, 1.24f, 0.96f, 1.18f, 0.92f, 1.18f, 1.22f },
        { 0.006f, 0.38f, 1.04f, 1.12f, 0.88f, 1.18f, 1.08f, 0.82f },
        { 0.004f, 0.48f, 1.12f, 1.02f, 1.12f, 1.06f, 1.04f, 1.20f },
        { 0.002f, 0.62f, 0.98f, 1.00f, 1.26f, 0.94f, 1.04f, 1.32f },
        { 0.020f, 0.31f, 1.30f, 0.90f, 0.72f, 1.28f, 0.88f, 0.68f },
        { 0.001f, 0.80f, 1.00f, 1.04f, 1.16f, 1.00f, 1.08f, 1.24f }
    }};
}

void RotatorDSP::prepare (double newSampleRate, int, int newNumChannels)
{
    sampleRate = std::max (std::isfinite (newSampleRate) ? newSampleRate : 44100.0, 1.0);
    numChannels = std::clamp (newNumChannels, 1, 2);
    const auto delayLength = static_cast<size_t> (std::ceil (sampleRate * 12.5)) + 8u;
    const auto dopplerLength = static_cast<size_t> (std::ceil (sampleRate * 0.05)) + 8u;
    const auto binauralLength = static_cast<size_t> (std::ceil (sampleRate * 0.003)) + 8u;
    delayLeft.assign (delayLength, 0.0f);
    delayRight.assign (delayLength, 0.0f);
    dopplerLowLeft.assign (dopplerLength, 0.0f);
    dopplerLowRight.assign (dopplerLength, 0.0f);
    dopplerHighLeft.assign (dopplerLength, 0.0f);
    dopplerHighRight.assign (dopplerLength, 0.0f);
    binauralDelayLeft.assign (binauralLength, 0.0f);
    binauralDelayRight.assign (binauralLength, 0.0f);
    inputGainSmoother.reset (sampleRate, 0.012);
    outputGainSmoother.reset (sampleRate, 0.012);
    mixSmoother.reset (sampleRate, 0.012);
    modelAmountSmoother.reset (sampleRate, 0.024);
    rotatorAmountSmoother.reset (sampleRate, 0.024);
    dopplerAmountSmoother.reset (sampleRate, 0.024);
    renderModeSmoother.reset (sampleRate, 0.024);
    dreamBlendSmoother.reset (sampleRate, 0.024);
    freezeSmoother.reset (sampleRate, 0.024);
    speakerLowCutSmoother.reset (sampleRate, 0.024);
    speakerHighCutSmoother.reset (sampleRate, 0.024);
    speakerLowGainSmoother.reset (sampleRate, 0.024);
    speakerMidGainSmoother.reset (sampleRate, 0.024);
    speakerHighGainSmoother.reset (sampleRate, 0.024);
    speakerLowMidGainSmoother.reset (sampleRate, 0.024);
    speakerPresenceGainSmoother.reset (sampleRate, 0.024);
    speakerAirGainSmoother.reset (sampleRate, 0.024);
    speakerModelGainSmoother.reset (sampleRate, 0.024);
    speakerDriveSmoother.reset (sampleRate, 0.024);
    binauralAzimuthSmoother.reset (sampleRate, 0.024);
    smoothersInitialised = false;
    reset();
}

void RotatorDSP::reset()
{
    rotorPhase = 0.0f;
    rotorRate = 0.0f;
    targetRotorRate = 0.0f;
    drumPhase = 0.0f;
    drumRate = 0.0f;
    targetDrumRate = 0.0f;
    secondaryHornPhase = 0.0f;
    secondaryDrumPhase = 0.0f;
    inputPeak = 0.0f;
    outputPeak = 0.0f;
    bandEnergy = { 0.0f, 0.0f, 0.0f };
    telemetryRotorPhase.store (0.0f, std::memory_order_relaxed);
    telemetrySequence.store (0u, std::memory_order_release);
    telemetryRotorRate.store (0.0f, std::memory_order_relaxed);
    telemetryRotorSignedRate.store (0.0f, std::memory_order_relaxed);
    telemetryInputPeak.store (0.0f, std::memory_order_relaxed);
    telemetryOutputPeak.store (0.0f, std::memory_order_relaxed);
    telemetryBand0.store (0.0f, std::memory_order_relaxed);
    telemetryBand1.store (0.0f, std::memory_order_relaxed);
    telemetryBand2.store (0.0f, std::memory_order_relaxed);
    delayWrite = 0;
    dopplerWrite = 0;
    binauralWrite = 0;
    std::fill (delayLeft.begin(), delayLeft.end(), 0.0f);
    std::fill (delayRight.begin(), delayRight.end(), 0.0f);
    std::fill (dopplerLowLeft.begin(), dopplerLowLeft.end(), 0.0f);
    std::fill (dopplerLowRight.begin(), dopplerLowRight.end(), 0.0f);
    std::fill (dopplerHighLeft.begin(), dopplerHighLeft.end(), 0.0f);
    std::fill (dopplerHighRight.begin(), dopplerHighRight.end(), 0.0f);
    std::fill (binauralDelayLeft.begin(), binauralDelayLeft.end(), 0.0f);
    std::fill (binauralDelayRight.begin(), binauralDelayRight.end(), 0.0f);
    inputGainSmoother.setCurrentAndTargetValue (0.0f);
    outputGainSmoother.setCurrentAndTargetValue (0.0f);
    mixSmoother.setCurrentAndTargetValue (0.0f);
    modelAmountSmoother.setCurrentAndTargetValue (0.0f);
    rotatorAmountSmoother.setCurrentAndTargetValue (0.0f);
    dopplerAmountSmoother.setCurrentAndTargetValue (0.0f);
    renderModeSmoother.setCurrentAndTargetValue (0.0f);
    dreamBlendSmoother.setCurrentAndTargetValue (0.0f);
    freezeSmoother.setCurrentAndTargetValue (0.0f);
    speakerLowCutSmoother.setCurrentAndTargetValue (0.0f);
    speakerHighCutSmoother.setCurrentAndTargetValue (0.0f);
    speakerLowGainSmoother.setCurrentAndTargetValue (0.0f);
    speakerMidGainSmoother.setCurrentAndTargetValue (0.0f);
    speakerHighGainSmoother.setCurrentAndTargetValue (0.0f);
    speakerLowMidGainSmoother.setCurrentAndTargetValue (0.0f);
    speakerPresenceGainSmoother.setCurrentAndTargetValue (0.0f);
    speakerAirGainSmoother.setCurrentAndTargetValue (0.0f);
    speakerModelGainSmoother.setCurrentAndTargetValue (0.0f);
    speakerDriveSmoother.setCurrentAndTargetValue (0.0f);
    binauralAzimuthSmoother.setCurrentAndTargetValue (0.0f);
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
            // These are beat-length multipliers. At 120 BPM, a quarter note is
            // 2 Hz, so the sequence yields 16 Hz for 1/32 and halves through
            // 8 bars.
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

RotatorDSP::SpeakerBands RotatorDSP::processSpeaker (float input,
                                                     ChannelState& state,
                                                     const Params& params,
                                                     const SpeakerVoicing& voicing,
                                                     float modelAmount)
{
    const auto qualityFactor = params.quality == 1 ? 1.35f : 1.0f;
    auto low = onePoleLowpass (input, state.low, voicing.lowCut * qualityFactor);
    auto high = input - onePoleLowpass (input, state.high, voicing.highCut / qualityFactor);
    if (params.quality == 1)
    {
        low = onePoleLowpass (low, state.low, voicing.lowCut * 0.55f);
        high = input - onePoleLowpass (input - high, state.high, voicing.highCut * 0.65f);
    }
    const auto mid = input - low - high;
    const auto resonance = 0.65f + 0.6f * params.resonance;
    const auto cabinetCoefficient = (0.06f + 0.15f * (1.0f - params.damping))
                                  * (params.quality == 1 ? 0.72f : 1.0f);
    const auto cabinet = onePoleLowpass (mid * resonance, state.cabinet, cabinetCoefficient);
    const auto amount = clamp01 (modelAmount);
    // Split the broad mid band once more so cabinet/body and horn presence can
    // be voiced independently without adding a second filter-bank allocation.
    const auto lowMidCoefficient = std::clamp (0.045f + 0.12f * voicing.lowCut
                                               + 0.06f * params.resonance,
                                               0.035f, 0.24f);
    const auto presenceCoefficient = std::clamp (0.16f + 0.16f * voicing.highCut
                                                 + 0.08f * (params.quality == 1 ? 1.0f : 0.0f),
                                                 0.14f, 0.52f);
    const auto lowMid = onePoleLowpass (mid, state.lowMid, lowMidCoefficient);
    const auto presenceShelf = onePoleLowpass (mid, state.presence, presenceCoefficient);
    const auto presence = presenceShelf - lowMid;
    const auto lowMidGain = 0.5f * (voicing.midGain + voicing.lowMidGain);
    const auto presenceGain = 0.5f * (voicing.midGain + voicing.presenceGain);
    const SpeakerBands modeled {
        low * voicing.lowGain * voicing.modelGain,
        (lowMid * lowMidGain
         + presence * presenceGain
         + cabinet * (0.32f + 0.18f * params.resonance)) * voicing.modelGain,
        high * voicing.highGain * voicing.airGain * voicing.modelGain
    };
    return {
        low + (modeled.low - low) * amount,
        mid + (modeled.mid - mid) * amount,
        high + (modeled.high - high) * amount
    };
}

float RotatorDSP::processDoppler (float input,
                                  std::vector<float>& delay,
                                  float phase,
                                  float radius,
                                  float amount) noexcept
{
    if (delay.empty())
        return input;

    const auto safeInput = std::isfinite (input) ? input : 0.0f;
    delay[dopplerWrite] = safeInput;

    const auto safeAmount = clamp01 (amount);
    if (safeAmount <= 0.000001f)
        return safeInput;

    // A rotating source produces a radial velocity v = r * omega * cos(theta).
    // Integrating v / c gives a fractional-delay excursion of r / c. The
    // positive offset keeps the interpolator causal while preserving that
    // changing delay, and the signed phase rate naturally handles reversal.
    const auto radiusSamples = static_cast<float> (sampleRate) * radius / speedOfSound * safeAmount;
    const auto delaySamples = std::clamp (radiusSamples + 1.5f
                                          + radiusSamples * std::sin (phase),
                                          1.0f,
                                          static_cast<float> (delay.size() - 2u));
    auto readPosition = static_cast<float> (dopplerWrite) - delaySamples;
    const auto delaySize = static_cast<float> (delay.size());
    while (readPosition < 0.0f)
        readPosition += delaySize;
    while (readPosition >= delaySize)
        readPosition -= delaySize;

    const auto index = static_cast<size_t> (readPosition);
    const auto fraction = readPosition - static_cast<float> (index);
    const auto next = (index + 1u) % delay.size();
    return delay[index] + (delay[next] - delay[index]) * fraction;
}

float RotatorDSP::processBinauralDelay (float input,
                                        std::vector<float>& delay,
                                        float delaySamples) noexcept
{
    if (delay.empty())
        return input;

    const auto safeInput = std::isfinite (input) ? input : 0.0f;
    delay[binauralWrite] = safeInput;

    const auto safeDelay = std::clamp (std::isfinite (delaySamples) ? delaySamples : 0.0f,
                                       0.0f,
                                       static_cast<float> (delay.size() - 2u));
    if (safeDelay <= 0.0001f)
        return safeInput;

    auto readPosition = static_cast<float> (binauralWrite) - safeDelay;
    const auto delaySize = static_cast<float> (delay.size());
    while (readPosition < 0.0f)
        readPosition += delaySize;
    while (readPosition >= delaySize)
        readPosition -= delaySize;

    const auto index = static_cast<size_t> (readPosition);
    const auto fraction = readPosition - static_cast<float> (index);
    const auto next = (index + 1u) % delay.size();
    return delay[index] + (delay[next] - delay[index]) * fraction;
}

float RotatorDSP::processHrtfFilter (float input,
                                     ChannelState& state,
                                     float farRatio,
                                     float lateral) noexcept
{
    // A compact, minimum-phase ear/pinna cue. This is intentionally an
    // original embedded filter rather than an unlicensed SOFA/HRTF capture.
    // Eight samples are enough to add a stable early spectral fingerprint
    // while keeping the callback cost bounded and allocation-free.
    constexpr std::array<float, 8> taps {
        0.86f, 0.19f, -0.11f, 0.075f, -0.045f, 0.026f, -0.014f, 0.008f
    };

    const auto safeInput = std::isfinite (input) ? input : 0.0f;
    const auto safeFar = clamp01 (farRatio);
    const auto safeLateral = clamp01 (std::abs (lateral));
    auto& history = state.hrtfHistory;
    const auto write = state.hrtfWrite % history.size();
    history[write] = safeInput;

    auto filtered = 0.0f;
    for (size_t tap = 0; tap < taps.size(); ++tap)
    {
        const auto index = (write + history.size() - tap) % history.size();
        filtered += history[index] * taps[tap];
    }

    state.hrtfWrite = (write + 1u) % history.size();
    const auto cueMix = std::clamp (0.10f + 0.22f * safeFar + 0.06f * safeLateral,
                                    0.08f, 0.36f);
    const auto shoulderLoss = std::clamp (0.015f + 0.08f * safeFar
                                          + 0.025f * safeLateral,
                                          0.0f, 0.16f);
    const auto shaped = safeInput * (1.0f - cueMix) + filtered * cueMix;
    return shaped * (1.0f - shoulderLoss);
}

float RotatorDSP::processDream (float input,
                                ChannelState& state,
                                int channel,
                                const Params& params,
                                float freezeBlend)
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

    const auto freezeAmount = clamp01 (freezeBlend);
    const auto freezeInput = input * (1.0f - freezeAmount);
    const auto tailFactor = std::clamp (0.55f + 0.45f * (params.tail / 12.0f), 0.0f, 1.0f);
    const auto regularFeedback = std::clamp (params.feedback * (0.65f + params.dream * 0.3f)
                                             * (0.75f + 0.25f * tailFactor),
                                             0.0f, 0.97f);
    const auto feedback = regularFeedback + (0.9995f - regularFeedback) * freezeAmount;
    const auto regularDamping = std::clamp (0.9992f
                                             - 0.00065f * std::clamp (params.dreamDamping, 0.0f, 1.0f)
                                             - 0.00025f * (1.0f - tailFactor),
                                             0.97f, 0.9995f);
    const auto damping = regularDamping + (1.0f - regularDamping) * freezeAmount;
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
    auto dreamProcessParams = params;
    dreamProcessParams.dreamBypass = false;
    const auto samples = buffer.getNumSamples();
    const auto channels = std::min (buffer.getNumChannels(), numChannels);
    if (channels <= 0 || samples <= 0 || delayLeft.empty() || dopplerLowLeft.empty()
        || binauralDelayLeft.empty() || binauralDelayRight.empty())
        return;

    const auto inputGainTarget = juce::Decibels::decibelsToGain (params.inputTrimDb);
    const auto outputGainTarget = juce::Decibels::decibelsToGain (params.outputTrimDb);
    const auto mixTarget = params.bypass ? 0.0f : clamp01 (params.mix);
    const auto targetRateMagnitude = currentRateForParams (params) * (0.35f + params.motion * 0.9f);
    const auto directionSign = params.direction == 0 ? 1.0f : -1.0f;
    targetRotorRate = targetRateMagnitude * directionSign;
    targetDrumRate = targetRotorRate * drumRateRatio;
    const auto maxRateStep = 8.0f
                           / (std::max (0.01f, params.inertia) * static_cast<float> (sampleRate));
    const auto rotorMotionScale = params.depth * (0.35f + params.motion * 0.9f);
    const auto rotorAmountTarget = clamp01 (params.rotatorAmount * rotorMotionScale);
    const auto dopplerAmountTarget = clamp01 (params.dopplerAmount * rotorMotionScale);
    const auto modelAmountTarget = speakerModelAmount (params);
    const auto renderModeTarget = params.renderMode == 0 ? 0.0f : 1.0f;
    const auto dreamBlendTarget = (! params.dreamBypass && params.dream > 0.0001f) ? 1.0f : 0.0f;
    const auto freezeTarget = params.freeze ? 1.0f : 0.0f;
    const auto model = std::clamp (params.model, 0, 7);
    const auto& profile = speakerProfiles[static_cast<size_t> (model)];
    const auto speakerLowCutTarget = finiteClamp (profile.lowCut, 0.015f, 0.0f, 0.9999f);
    const auto speakerHighCutTarget = finiteClamp (profile.highCut, 0.24f, 0.0f, 0.9999f);
    const auto speakerLowGainTarget = finiteClamp (profile.lowGain, 1.0f, 0.0f, 4.0f);
    const auto speakerMidGainTarget = finiteClamp (profile.midGain, 1.0f, 0.0f, 4.0f);
    const auto speakerHighGainTarget = finiteClamp (profile.highGain, 1.0f, 0.0f, 4.0f);
    const auto speakerLowMidGainTarget = finiteClamp (profile.lowMidGain, 1.0f, 0.0f, 4.0f);
    const auto speakerPresenceGainTarget = finiteClamp (profile.presenceGain, 1.0f, 0.0f, 4.0f);
    const auto speakerAirGainTarget = finiteClamp (profile.airGain, 1.0f, 0.0f, 4.0f);
    const auto speakerModelGainTarget = params.loudnessMatch ? modelGain (model) : 1.0f;
    const auto speakerDriveTarget = std::clamp (speakerDrive (params), 0.0f, 1.0f);
    const auto binauralAzimuthTarget = std::clamp (params.angle / 45.0f, -1.0f, 1.0f);
    if (! smoothersInitialised)
    {
        inputGainSmoother.setCurrentAndTargetValue (inputGainTarget);
        outputGainSmoother.setCurrentAndTargetValue (outputGainTarget);
        mixSmoother.setCurrentAndTargetValue (mixTarget);
        modelAmountSmoother.setCurrentAndTargetValue (modelAmountTarget);
        rotatorAmountSmoother.setCurrentAndTargetValue (rotorAmountTarget);
        dopplerAmountSmoother.setCurrentAndTargetValue (dopplerAmountTarget);
        renderModeSmoother.setCurrentAndTargetValue (renderModeTarget);
        dreamBlendSmoother.setCurrentAndTargetValue (dreamBlendTarget);
        freezeSmoother.setCurrentAndTargetValue (freezeTarget);
        speakerLowCutSmoother.setCurrentAndTargetValue (speakerLowCutTarget);
        speakerHighCutSmoother.setCurrentAndTargetValue (speakerHighCutTarget);
        speakerLowGainSmoother.setCurrentAndTargetValue (speakerLowGainTarget);
        speakerMidGainSmoother.setCurrentAndTargetValue (speakerMidGainTarget);
        speakerHighGainSmoother.setCurrentAndTargetValue (speakerHighGainTarget);
        speakerLowMidGainSmoother.setCurrentAndTargetValue (speakerLowMidGainTarget);
        speakerPresenceGainSmoother.setCurrentAndTargetValue (speakerPresenceGainTarget);
        speakerAirGainSmoother.setCurrentAndTargetValue (speakerAirGainTarget);
        speakerModelGainSmoother.setCurrentAndTargetValue (speakerModelGainTarget);
        speakerDriveSmoother.setCurrentAndTargetValue (speakerDriveTarget);
        binauralAzimuthSmoother.setCurrentAndTargetValue (binauralAzimuthTarget);
        smoothersInitialised = true;
    }
    else
    {
        inputGainSmoother.setTargetValue (inputGainTarget);
        outputGainSmoother.setTargetValue (outputGainTarget);
        mixSmoother.setTargetValue (mixTarget);
        modelAmountSmoother.setTargetValue (modelAmountTarget);
        rotatorAmountSmoother.setTargetValue (rotorAmountTarget);
        dopplerAmountSmoother.setTargetValue (dopplerAmountTarget);
        renderModeSmoother.setTargetValue (renderModeTarget);
        dreamBlendSmoother.setTargetValue (dreamBlendTarget);
        freezeSmoother.setTargetValue (freezeTarget);
        speakerLowCutSmoother.setTargetValue (speakerLowCutTarget);
        speakerHighCutSmoother.setTargetValue (speakerHighCutTarget);
        speakerLowGainSmoother.setTargetValue (speakerLowGainTarget);
        speakerMidGainSmoother.setTargetValue (speakerMidGainTarget);
        speakerHighGainSmoother.setTargetValue (speakerHighGainTarget);
        speakerLowMidGainSmoother.setTargetValue (speakerLowMidGainTarget);
        speakerPresenceGainSmoother.setTargetValue (speakerPresenceGainTarget);
        speakerAirGainSmoother.setTargetValue (speakerAirGainTarget);
        speakerModelGainSmoother.setTargetValue (speakerModelGainTarget);
        speakerDriveSmoother.setTargetValue (speakerDriveTarget);
        binauralAzimuthSmoother.setTargetValue (binauralAzimuthTarget);
    }
    const auto spaceAmount = 0.12f + params.space * 0.88f;
    const auto outputSafetyClip = ! params.bypass
                               && (modelAmountTarget > 0.000001f
                                   || rotorAmountTarget > 0.000001f
                                   || dopplerAmountTarget > 0.000001f
                                   || (! params.dreamBypass && params.dream > 0.0001f)
                                   || params.earlyReflections > 0.000001f
                                   || params.renderMode == 0);

    const auto structure = std::clamp (params.structure, 0, 2);
    const auto structureBias = static_cast<float> (structure) * 0.23f;
    const auto motionForPhase = [structure] (float phase) noexcept
    {
        if (structure == 0)
            return 0.5f + 0.5f * std::sin (phase);
        if (structure == 1)
            return 0.5f + 0.35f * std::sin (phase)
                 + 0.15f * std::sin (2.0f * phase + 0.4f);
        return 0.5f + 0.5f * std::sin (phase) * std::cos (phase * 0.5f);
    };

    const auto delaySize = delayLeft.size();
    const auto dopplerDelaySize = dopplerLowLeft.size();
    for (int sample = 0; sample < samples; ++sample)
    {
        const auto inputGain = inputGainSmoother.getNextValue();
        const auto outputGain = outputGainSmoother.getNextValue();
        const auto modelAmount = clamp01 (modelAmountSmoother.getNextValue());
        const auto rotorAmount = clamp01 (rotatorAmountSmoother.getNextValue());
        const auto renderModeBlend = clamp01 (renderModeSmoother.getNextValue());
        const auto dreamBlend = clamp01 (dreamBlendSmoother.getNextValue());
        const auto freezeBlend = clamp01 (freezeSmoother.getNextValue());
        const auto rawLeft = buffer.getSample (0, sample);
        const auto rawRight = channels > 1 ? buffer.getSample (1, sample) : rawLeft;
        const auto leftIn = std::isfinite (rawLeft) ? rawLeft * inputGain : 0.0f;
        const auto rightIn = std::isfinite (rawRight) ? rawRight * inputGain : leftIn;
        const auto mono = params.feedMode == 0 ? (leftIn + rightIn) * 0.5f : leftIn;
        const auto sourceLeft = params.feedMode == 0 ? mono : leftIn;
        const auto sourceRight = params.feedMode == 0 ? mono : rightIn;

        const SpeakerVoicing voicing {
            speakerLowCutSmoother.getNextValue(),
            speakerHighCutSmoother.getNextValue(),
            speakerLowGainSmoother.getNextValue(),
            speakerMidGainSmoother.getNextValue(),
            speakerHighGainSmoother.getNextValue(),
            speakerLowMidGainSmoother.getNextValue(),
            speakerPresenceGainSmoother.getNextValue(),
            speakerAirGainSmoother.getNextValue(),
            speakerModelGainSmoother.getNextValue(),
            speakerDriveSmoother.getNextValue()
        };

        const auto speakerLeftBands = processSpeaker (sourceLeft, channelStates[0], params, voicing, modelAmount);
        const auto speakerRightBands = processSpeaker (sourceRight, channelStates[1], params, voicing, modelAmount);

        // Rotor speed is signed. When direction changes, the target crosses
        // zero and the inertia-limited slew produces a real coast-down and
        // spin-up instead of an instantaneous phase reversal.
        rotorRate += std::clamp (targetRotorRate - rotorRate, -maxRateStep, maxRateStep);
        drumRate += std::clamp (targetDrumRate - drumRate, -maxRateStep, maxRateStep);
        rotorPhase += twoPi * rotorRate / static_cast<float> (sampleRate);
        drumPhase += twoPi * drumRate / static_cast<float> (sampleRate);
        secondaryHornPhase += twoPi * rotorRate * 1.17f / static_cast<float> (sampleRate);
        secondaryDrumPhase += twoPi * drumRate * 1.13f / static_cast<float> (sampleRate);
        if (rotorPhase >= twoPi || rotorPhase < 0.0f)
        {
            rotorPhase = std::fmod (rotorPhase, twoPi);
            if (rotorPhase < 0.0f)
                rotorPhase += twoPi;
        }
        if (drumPhase >= twoPi || drumPhase < 0.0f)
        {
            drumPhase = std::fmod (drumPhase, twoPi);
            if (drumPhase < 0.0f)
                drumPhase += twoPi;
        }
        if (secondaryHornPhase >= twoPi || secondaryHornPhase < 0.0f)
        {
            secondaryHornPhase = std::fmod (secondaryHornPhase, twoPi);
            if (secondaryHornPhase < 0.0f)
                secondaryHornPhase += twoPi;
        }
        if (secondaryDrumPhase >= twoPi || secondaryDrumPhase < 0.0f)
        {
            secondaryDrumPhase = std::fmod (secondaryDrumPhase, twoPi);
            if (secondaryDrumPhase < 0.0f)
                secondaryDrumPhase += twoPi;
        }

        const auto rightHornPhase = params.feedMode == 2
            ? secondaryHornPhase + 0.37f + structureBias
            : rotorPhase + pi + structureBias;
        const auto rightDrumPhase = params.feedMode == 2
            ? secondaryDrumPhase + 0.23f + structureBias
            : drumPhase + pi + structureBias;
        const auto leftHornPhase = rotorPhase + structureBias;
        const auto leftDrumPhase = drumPhase + structureBias;
        const auto leftHornMotion = motionForPhase (leftHornPhase);
        const auto rightHornMotion = motionForPhase (rightHornPhase);
        const auto leftDrumMotion = motionForPhase (leftDrumPhase);
        const auto rightDrumMotion = motionForPhase (rightDrumPhase);
        const auto leftMotion = 0.5f * (leftHornMotion + leftDrumMotion);
        const auto rightMotion = 0.5f * (rightHornMotion + rightDrumMotion);

        const auto dopplerAmount = clamp01 (dopplerAmountSmoother.getNextValue());
        const auto lowLeft = processDoppler (speakerLeftBands.low, dopplerLowLeft,
                                             leftDrumPhase, drumRadiusMeters, dopplerAmount);
        const auto lowRight = processDoppler (speakerRightBands.low, dopplerLowRight,
                                              rightDrumPhase, drumRadiusMeters, dopplerAmount);
        const auto highLeft = processDoppler (speakerLeftBands.high, dopplerHighLeft,
                                               leftHornPhase, hornRadiusMeters, dopplerAmount);
        const auto highRight = processDoppler (speakerRightBands.high, dopplerHighRight,
                                                rightHornPhase, hornRadiusMeters, dopplerAmount);
        const auto distanceGain = 1.0f / (0.75f + std::max (params.distance, 0.5f) * 0.25f);
        const auto anglePan = std::sin (params.angle * pi / 180.0f) * 0.28f * spaceAmount;
        const auto leftGain = distanceGain * (1.0f - anglePan) * (1.0f - 0.3f * rotorAmount * leftMotion);
        const auto rightGain = distanceGain * (1.0f + anglePan) * (1.0f - 0.3f * rotorAmount * rightMotion);

        const auto leftLowGain = 1.0f - rotorAmount * 0.35f + rotorAmount * leftDrumMotion * 0.7f;
        const auto leftHighGain = 1.0f - rotorAmount * 0.35f + rotorAmount * leftHornMotion * 0.7f;
        const auto rightLowGain = 1.0f - rotorAmount * 0.35f + rotorAmount * rightDrumMotion * 0.7f;
        const auto rightHighGain = 1.0f - rotorAmount * 0.35f + rotorAmount * rightHornMotion * 0.7f;
        const auto leftMidGain = 1.0f - rotorAmount * 0.18f + rotorAmount * leftMotion * 0.36f;
        const auto rightMidGain = 1.0f - rotorAmount * 0.18f + rotorAmount * rightMotion * 0.36f;
        const auto leftRotated = lowLeft * leftLowGain
                              + speakerLeftBands.mid * leftMidGain
                              + highLeft * leftHighGain;
        const auto rightRotated = lowRight * rightLowGain
                               + speakerRightBands.mid * rightMidGain
                               + highRight * rightHighGain;
        const auto modelDriveLeft = modelAmount > 0.000001f
            ? softClip (leftRotated, voicing.drive)
            : leftRotated;
        const auto modelDriveRight = modelAmount > 0.000001f
            ? softClip (rightRotated, voicing.drive)
            : rightRotated;
        const auto speakerLeft = modelDriveLeft;
        const auto speakerRight = modelDriveRight;

        auto speakerWetLeft = speakerLeft * leftGain;
        auto speakerWetRight = speakerRight * rightGain;
        const auto reflection = params.earlyReflections * (0.02f + 0.06f * spaceAmount);
        speakerWetLeft += channelStates[0].reflection * reflection;
        speakerWetRight += channelStates[1].reflection * reflection;
        const auto reflectionCoefficient = 0.01f + 0.12f * (1.0f - clamp01 (params.roomDamping));
        channelStates[0].reflection += (speakerWetLeft - channelStates[0].reflection) * reflectionCoefficient;
        channelStates[1].reflection += (speakerWetRight - channelStates[1].reflection) * reflectionCoefficient;

        // Always advance the binaural path so render-mode automation can crossfade
        // between two live paths without exposing stale delay-line contents.
        // Lightweight HRTF-style cues are intentionally parameterised rather than
        // a substitute for a licensed SOFA convolution asset.
        const auto listenerAzimuth = binauralAzimuthSmoother.getNextValue();
        const auto rotorAzimuth = std::sin (rotorPhase)
                                * params.depth
                                * (0.35f + 0.65f * rotorAmount);
        const auto azimuth = std::clamp (listenerAzimuth * 0.75f + rotorAzimuth * 0.65f,
                                         -1.0f,
                                         1.0f);
        const auto leftFar = 0.5f + 0.5f * azimuth;
        const auto rightFar = 1.0f - leftFar;
        const auto leftShadow = 0.045f + 0.34f * leftFar;
        const auto rightShadow = 0.045f + 0.34f * rightFar;
        const auto crossfeed = 0.035f + params.space * 0.12f;
        const auto shadowSmoothing = 0.012f + 0.028f * std::max (leftShadow, rightShadow);
        channelStates[0].hrtfShadow += (speakerWetLeft - channelStates[0].hrtfShadow) * shadowSmoothing;
        channelStates[1].hrtfShadow += (speakerWetRight - channelStates[1].hrtfShadow) * shadowSmoothing;

        const auto leftHigh = speakerWetLeft - channelStates[0].hrtfShadow;
        const auto rightHigh = speakerWetRight - channelStates[1].hrtfShadow;
        const auto leftShaped = channelStates[0].hrtfShadow * (1.0f - leftShadow * 0.08f)
                              + leftHigh * (1.0f - leftShadow);
        const auto rightShaped = channelStates[1].hrtfShadow * (1.0f - rightShadow * 0.08f)
                               + rightHigh * (1.0f - rightShadow);

        const auto leftEar = processHrtfFilter (leftShaped, channelStates[0], leftFar, azimuth);
        const auto rightEar = processHrtfFilter (rightShaped, channelStates[1], rightFar, azimuth);

        channelStates[0].hrtfCrossfeed += (rightEar - channelStates[0].hrtfCrossfeed)
                                         * (0.018f + 0.07f * crossfeed);
        channelStates[1].hrtfCrossfeed += (leftEar - channelStates[1].hrtfCrossfeed)
                                         * (0.018f + 0.07f * crossfeed);

        const auto itdSamples = static_cast<float> (sampleRate * maxBinauralItdSeconds);
        const auto binauralLeft = processBinauralDelay (leftEar,
                                                        binauralDelayLeft,
                                                        itdSamples * leftFar) * 0.94f
                                + channelStates[0].hrtfCrossfeed * crossfeed;
        const auto binauralRight = processBinauralDelay (rightEar,
                                                         binauralDelayRight,
                                                         itdSamples * rightFar) * 0.94f
                                 + channelStates[1].hrtfCrossfeed * crossfeed;

        auto wetLeft = binauralLeft * (1.0f - renderModeBlend) + speakerWetLeft * renderModeBlend;
        auto wetRight = binauralRight * (1.0f - renderModeBlend) + speakerWetRight * renderModeBlend;

        // Keep Dream's delay state alive only during its short transition and
        // crossfade its return so bypass automation does not click.
        if (dreamBlend > 0.000001f)
        {
            const auto dreamLeft = processDream (wetLeft, channelStates[0], 0,
                                                 dreamProcessParams, freezeBlend);
            const auto dreamRight = processDream (wetRight, channelStates[1], 1,
                                                  dreamProcessParams, freezeBlend);
            wetLeft += (dreamLeft - wetLeft) * dreamBlend;
            wetRight += (dreamRight - wetRight) * dreamBlend;
        }

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
        bandEnergy[0] = bandEnergy[0] * 0.995f + std::abs (lowLeft + lowRight) * 0.002f;
        bandEnergy[1] = bandEnergy[1] * 0.995f
                      + std::abs (speakerLeftBands.mid + speakerRightBands.mid) * 0.002f;
        bandEnergy[2] = bandEnergy[2] * 0.995f + std::abs (highLeft + highRight) * 0.002f;

        // The delay line must advance in Standalone and when the host has no PlayHead.
        if (++delayWrite >= delaySize)
            delayWrite = 0;
        if (++dopplerWrite >= dopplerDelaySize)
            dopplerWrite = 0;
        if (++binauralWrite >= binauralDelayLeft.size())
            binauralWrite = 0;
    }

    // Publish a bounded snapshot for the message thread. The processing state
    // above remains audio-thread owned; editor telemetry only reads atomics.
    telemetrySequence.fetch_add (1u, std::memory_order_release);
    telemetryRotorPhase.store (std::isfinite (rotorPhase) ? rotorPhase : 0.0f, std::memory_order_relaxed);
    telemetryRotorRate.store (std::isfinite (rotorRate) ? std::abs (rotorRate) : 0.0f,
                              std::memory_order_relaxed);
    telemetryRotorSignedRate.store (std::isfinite (rotorRate) ? rotorRate : 0.0f,
                                    std::memory_order_relaxed);
    telemetryInputPeak.store (std::isfinite (inputPeak) ? inputPeak : 0.0f, std::memory_order_relaxed);
    telemetryOutputPeak.store (std::isfinite (outputPeak) ? outputPeak : 0.0f, std::memory_order_relaxed);
    telemetryBand0.store (std::isfinite (bandEnergy[0]) ? bandEnergy[0] : 0.0f, std::memory_order_relaxed);
    telemetryBand1.store (std::isfinite (bandEnergy[1]) ? bandEnergy[1] : 0.0f, std::memory_order_relaxed);
    telemetryBand2.store (std::isfinite (bandEnergy[2]) ? bandEnergy[2] : 0.0f, std::memory_order_relaxed);
    telemetrySequence.fetch_add (1u, std::memory_order_release);
}
} // namespace openfad
