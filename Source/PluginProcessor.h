#pragma once

#include "Parameters.h"
#include "RotatorDSP.h"

#include <juce_audio_processors/juce_audio_processors.h>

#include <atomic>
#include <array>

class OpenFADRotatorAudioProcessor final : public juce::AudioProcessor
{
public:
    OpenFADRotatorAudioProcessor();
    ~OpenFADRotatorAudioProcessor() override = default;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "openFAD Rotator"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 12.0; }

    int getNumPrograms() override { return 8; }
    int getCurrentProgram() override { return currentProgram; }
    void setCurrentProgram (int index) override;
    const juce::String getProgramName (int index) override;
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    juce::AudioProcessorValueTreeState parameters;
    openfad::RotatorDSP& getDSP() noexcept { return dsp; }
    const openfad::RotatorDSP& getDSP() const noexcept { return dsp; }
    double getCurrentSampleRate() const noexcept { return currentSampleRate; }
    bool isPlaying() const noexcept { return playing.load (std::memory_order_relaxed); }
    const juce::String& getCurrentPresetName() const noexcept { return currentPresetName; }

    bool savePresetFile (const juce::File& file, const juce::String& name);
    bool loadPresetFile (const juce::File& file);

private:
    openfad::RotatorDSP::Params readParams() const;
    int readChoice (const char* parameterId, int fallback, int maximumIndex) const;
    void applyProgram (int index);
    void updateMidiFreeze (const juce::MidiMessage& message);
    void clearMidiFreeze() noexcept;
    void clearMidiFreezeOnAudioThread() noexcept;

    openfad::RotatorDSP dsp;
    double currentSampleRate = 44100.0;
    std::atomic<bool> playing { false };
    int currentProgram = 0;
    juce::String currentPresetName;
    std::atomic<float> midiFreeze { 0.0f };
    std::atomic<bool> midiFreezeClearRequested { false };
    std::array<uint8_t, 16 * 128> heldMidiNotes {};
    int heldMidiNoteCount = 0;
    juce::AudioPlayHead::PositionInfo lastPosition;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (OpenFADRotatorAudioProcessor)
};
