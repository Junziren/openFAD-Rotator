#pragma once

#include <juce_audio_basics/juce_audio_basics.h>

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace openfad
{
class RotatorDSP
{
public:
    struct SpeakerProfile
    {
        float lowCut = 0.015f;
        float highCut = 0.24f;
        float lowGain = 1.18f;
        float midGain = 1.22f;
        float highGain = 0.66f;
        float lowMidGain = 1.0f;
        float presenceGain = 1.0f;
        float airGain = 1.0f;
    };

    using SpeakerProfiles = std::array<SpeakerProfile, 8>;

    struct TelemetrySnapshot
    {
        float rotorPhase = 0.0f;
        float rotorRate = 0.0f;
        float rotorSignedRate = 0.0f;
        float inputPeak = 0.0f;
        float outputPeak = 0.0f;
        std::array<float, 3> bandEnergy { 0.0f, 0.0f, 0.0f };
    };

    static SpeakerProfiles defaultSpeakerProfiles() noexcept;
    void setSpeakerProfiles (const SpeakerProfiles& profiles) noexcept { speakerProfiles = profiles; }

    struct Params
    {
        float inputTrimDb = 0.0f;
        float outputTrimDb = 0.0f;
        float mix = 0.35f;
        bool bypass = false;
        int quality = 0;
        int model = 1;
        bool modelBypass = false;
        float drive = 0.2f;
        float resonance = 0.35f;
        float damping = 0.5f;
        bool loudnessMatch = true;
        int structure = 0;
        int feedMode = 0;
        int renderMode = 0;
        int speedMode = 1;
        float freeRate = 0.8f;
        int syncDivision = 5;
        float inertia = 2.2f;
        int direction = 0;
        float depth = 0.75f;
        float distance = 1.2f;
        float angle = 0.0f;
        float earlyReflections = 0.25f;
        float roomDamping = 0.55f;
        float modelAmount = 1.0f;
        float rotatorAmount = 1.0f;
        float dopplerAmount = 1.0f;
        bool dreamBypass = false;
        float predelay = 0.035f;
        bool predelaySync = false;
        float diffusion = 0.45f;
        float tail = 3.5f;
        float microshift = 8.0f;
        float dreamDamping = 0.35f;
        float feedback = 0.58f;
        bool freeze = false;
        float character = 0.35f;
        float motion = 0.35f;
        float space = 0.3f;
        float dream = 0.25f;
        double bpm = 120.0;
    };

    void prepare (double sampleRate, int maximumBlockSize, int numChannels);
    void reset();
    void process (juce::AudioBuffer<float>& buffer, const Params& params, bool isPlaying);

    float getRotorPhase() const noexcept { return telemetryRotorPhase.load (std::memory_order_relaxed); }
    float getRotorRate() const noexcept { return telemetryRotorRate.load (std::memory_order_relaxed); }
    float getInputPeak() const noexcept { return telemetryInputPeak.load (std::memory_order_relaxed); }
    float getOutputPeak() const noexcept { return telemetryOutputPeak.load (std::memory_order_relaxed); }
    TelemetrySnapshot getTelemetrySnapshot() const noexcept
    {
        TelemetrySnapshot snapshot;
        for (int attempt = 0; attempt < 4; ++attempt)
        {
            const auto begin = telemetrySequence.load (std::memory_order_acquire);
            if ((begin & 1u) != 0u)
                continue;

            snapshot.rotorPhase = telemetryRotorPhase.load (std::memory_order_relaxed);
            snapshot.rotorRate = telemetryRotorRate.load (std::memory_order_relaxed);
            snapshot.rotorSignedRate = telemetryRotorSignedRate.load (std::memory_order_relaxed);
            snapshot.inputPeak = telemetryInputPeak.load (std::memory_order_relaxed);
            snapshot.outputPeak = telemetryOutputPeak.load (std::memory_order_relaxed);
            snapshot.bandEnergy = {
                telemetryBand0.load (std::memory_order_relaxed),
                telemetryBand1.load (std::memory_order_relaxed),
                telemetryBand2.load (std::memory_order_relaxed)
            };

            const auto end = telemetrySequence.load (std::memory_order_acquire);
            if (begin == end)
                return snapshot;
        }

        return snapshot;
    }
    std::array<float, 3> getBandEnergy() const noexcept
    {
        return {
            telemetryBand0.load (std::memory_order_relaxed),
            telemetryBand1.load (std::memory_order_relaxed),
            telemetryBand2.load (std::memory_order_relaxed)
        };
    }

private:
    struct SpeakerBands
    {
        float low = 0.0f;
        float mid = 0.0f;
        float high = 0.0f;
    };

    struct SpeakerVoicing
    {
        float lowCut = 0.015f;
        float highCut = 0.24f;
        float lowGain = 1.18f;
        float midGain = 1.22f;
        float highGain = 0.66f;
        float lowMidGain = 1.0f;
        float presenceGain = 1.0f;
        float airGain = 1.0f;
        float modelGain = 1.0f;
        float drive = 0.0f;
    };

    struct ChannelState
    {
        float low = 0.0f;
        float high = 0.0f;
        float lowMid = 0.0f;
        float presence = 0.0f;
        float cabinet = 0.0f;
        float dreamLow = 0.0f;
        float dreamHigh = 0.0f;
        float reflection = 0.0f;
        float hrtfShadow = 0.0f;
        float hrtfCrossfeed = 0.0f;
        std::array<float, 8> hrtfHistory{};
        size_t hrtfWrite = 0;
        std::array<float, 8> diffusion{};
    };

    SpeakerBands processSpeaker (float input,
                                 ChannelState& state,
                                 const Params& params,
                                 const SpeakerVoicing& voicing,
                                 float modelAmount);
    float processDoppler (float input,
                          std::vector<float>& delay,
                          float phase,
                          float radius,
                          float amount) noexcept;
    float processBinauralDelay (float input,
                                std::vector<float>& delay,
                                float delaySamples) noexcept;
    float processHrtfFilter (float input,
                             ChannelState& state,
                             float farRatio,
                             float lateral) noexcept;
    float processDream (float input,
                        ChannelState& state,
                        int channel,
                        const Params& params,
                        float freezeBlend);
    float currentRateForParams (const Params& params) const noexcept;
    float modelGain (int model) const noexcept;

    double sampleRate = 44100.0;
    int numChannels = 2;
    float rotorPhase = 0.0f;
    float rotorRate = 0.0f;
    float targetRotorRate = 0.0f;
    float drumPhase = 0.0f;
    float drumRate = 0.0f;
    float targetDrumRate = 0.0f;
    float secondaryHornPhase = 0.0f;
    float secondaryDrumPhase = 0.0f;
    float inputPeak = 0.0f;
    float outputPeak = 0.0f;
    std::array<float, 3> bandEnergy { 0.0f, 0.0f, 0.0f };
    std::atomic<float> telemetryRotorPhase { 0.0f };
    std::atomic<uint32_t> telemetrySequence { 0u };
    std::atomic<float> telemetryRotorRate { 0.0f };
    std::atomic<float> telemetryRotorSignedRate { 0.0f };
    std::atomic<float> telemetryInputPeak { 0.0f };
    std::atomic<float> telemetryOutputPeak { 0.0f };
    std::atomic<float> telemetryBand0 { 0.0f };
    std::atomic<float> telemetryBand1 { 0.0f };
    std::atomic<float> telemetryBand2 { 0.0f };
    std::array<ChannelState, 2> channelStates;
    std::vector<float> delayLeft;
    std::vector<float> delayRight;
    std::vector<float> dopplerLowLeft;
    std::vector<float> dopplerLowRight;
    std::vector<float> dopplerHighLeft;
    std::vector<float> dopplerHighRight;
    std::vector<float> binauralDelayLeft;
    std::vector<float> binauralDelayRight;
    size_t delayWrite = 0;
    size_t dopplerWrite = 0;
    size_t binauralWrite = 0;
    juce::SmoothedValue<float> inputGainSmoother;
    juce::SmoothedValue<float> outputGainSmoother;
    juce::SmoothedValue<float> mixSmoother;
    juce::SmoothedValue<float> modelAmountSmoother;
    juce::SmoothedValue<float> rotatorAmountSmoother;
    juce::SmoothedValue<float> dopplerAmountSmoother;
    juce::SmoothedValue<float> renderModeSmoother;
    juce::SmoothedValue<float> dreamBlendSmoother;
    juce::SmoothedValue<float> freezeSmoother;
    juce::SmoothedValue<float> speakerLowCutSmoother;
    juce::SmoothedValue<float> speakerHighCutSmoother;
    juce::SmoothedValue<float> speakerLowGainSmoother;
    juce::SmoothedValue<float> speakerMidGainSmoother;
    juce::SmoothedValue<float> speakerHighGainSmoother;
    juce::SmoothedValue<float> speakerLowMidGainSmoother;
    juce::SmoothedValue<float> speakerPresenceGainSmoother;
    juce::SmoothedValue<float> speakerAirGainSmoother;
    juce::SmoothedValue<float> speakerModelGainSmoother;
    juce::SmoothedValue<float> speakerDriveSmoother;
    juce::SmoothedValue<float> binauralAzimuthSmoother;
    bool smoothersInitialised = false;
    SpeakerProfiles speakerProfiles = defaultSpeakerProfiles();
};
} // namespace openfad
