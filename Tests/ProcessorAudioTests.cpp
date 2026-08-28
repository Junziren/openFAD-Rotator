#include "../Source/PluginProcessor.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <iostream>
#include <set>
#include <string>

namespace
{
using Processor = OpenFADRotatorAudioProcessor;

float maximumDifference (const juce::AudioBuffer<float>& left,
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

bool allFinite (const juce::AudioBuffer<float>& buffer)
{
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
            if (! std::isfinite (buffer.getSample (channel, sample)))
                return false;

    return true;
}

void fillTestSignal (juce::AudioBuffer<float>& buffer, int offset = 0)
{
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
            buffer.setSample (channel, sample,
                              0.35f * std::sin (static_cast<float> (offset + sample + channel * 7) * 0.071f));
}

bool setActual (Processor& processor, const char* id, float actual, bool withGesture = true)
{
    auto* parameter = processor.parameters.getParameter (id);
    auto* ranged = dynamic_cast<juce::RangedAudioParameter*> (parameter);
    if (parameter == nullptr || ranged == nullptr)
        return false;

    const auto normalized = ranged->getNormalisableRange().convertTo0to1 (actual);
    if (withGesture)
        parameter->beginChangeGesture();
    parameter->setValueNotifyingHost (normalized);
    if (withGesture)
        parameter->endChangeGesture();
    return true;
}

float actualValue (const Processor& processor, const char* id, float fallback = 0.0f)
{
    if (const auto* raw = processor.parameters.getRawParameterValue (id))
    {
        const auto value = raw->load();
        if (std::isfinite (value))
            return value;
    }
    return fallback;
}

bool checkParameterContract (const Processor& processor)
{
    static constexpr std::array<const char*, 40> expectedIds {
        openfad::params::id::inputTrim,
        openfad::params::id::outputTrim,
        openfad::params::id::mix,
        openfad::params::id::bypass,
        openfad::params::id::quality,
        openfad::params::id::model,
        openfad::params::id::modelBypass,
        openfad::params::id::drive,
        openfad::params::id::resonance,
        openfad::params::id::damping,
        openfad::params::id::loudnessMatch,
        openfad::params::id::structure,
        openfad::params::id::feedMode,
        openfad::params::id::renderMode,
        openfad::params::id::speedMode,
        openfad::params::id::freeRate,
        openfad::params::id::syncDivision,
        openfad::params::id::inertia,
        openfad::params::id::direction,
        openfad::params::id::depth,
        openfad::params::id::distance,
        openfad::params::id::angle,
        openfad::params::id::earlyReflections,
        openfad::params::id::roomDamping,
        openfad::params::id::modelAmount,
        openfad::params::id::rotatorAmount,
        openfad::params::id::dopplerAmount,
        openfad::params::id::dreamBypass,
        openfad::params::id::predelay,
        openfad::params::id::predelaySync,
        openfad::params::id::diffusion,
        openfad::params::id::tail,
        openfad::params::id::microshift,
        openfad::params::id::dreamDamping,
        openfad::params::id::feedback,
        openfad::params::id::freeze,
        openfad::params::id::character,
        openfad::params::id::motion,
        openfad::params::id::space,
        openfad::params::id::dream
    };

    std::set<std::string> ids;
    for (auto* parameter : processor.getParameters())
    {
        if (auto* ranged = dynamic_cast<juce::RangedAudioParameter*> (parameter))
            ids.insert (ranged->getParameterID().toStdString());
    }

    if (ids.size() != static_cast<size_t> (processor.getParameters().size()))
    {
        std::cerr << "duplicate parameter IDs detected\n";
        return false;
    }

    for (const auto* id : expectedIds)
        if (processor.parameters.getParameter (id) == nullptr)
        {
            std::cerr << "missing parameter: " << id << "\n";
            return false;
        }

    return true;
}

class FixedPlayHead final : public juce::AudioPlayHead
{
public:
    juce::Optional<PositionInfo> getPosition() const override
    {
        return juce::makeOptional (position);
    }

    PositionInfo position;
};

bool checkStereoAndMonoLayouts()
{
    const auto stereo = juce::AudioChannelSet::stereo();
    const auto mono = juce::AudioChannelSet::mono();
    const auto disabled = juce::AudioChannelSet::disabled();

    Processor processor;
    juce::AudioProcessor::BusesLayout stereoLayout;
    stereoLayout.inputBuses.add (stereo);
    stereoLayout.outputBuses.add (stereo);
    if (! processor.isBusesLayoutSupported (stereoLayout)
        || ! processor.setBusesLayout (stereoLayout))
    {
        std::cerr << "stereo effect layout was rejected\n";
        return false;
    }

    juce::AudioProcessor::BusesLayout disabledInput;
    disabledInput.inputBuses.add (disabled);
    disabledInput.outputBuses.add (stereo);
    if (processor.isBusesLayoutSupported (disabledInput))
    {
        std::cerr << "disabled input layout was accepted\n";
        return false;
    }

    Processor monoProcessor;
    juce::AudioProcessor::BusesLayout monoLayout;
    monoLayout.inputBuses.add (mono);
    monoLayout.outputBuses.add (mono);
    if (! monoProcessor.isBusesLayoutSupported (monoLayout)
        || ! monoProcessor.setBusesLayout (monoLayout))
    {
        std::cerr << "mono effect layout was rejected\n";
        return false;
    }

    monoProcessor.prepareToPlay (48000.0, 128);
    auto buffer = juce::AudioBuffer<float> (1, 128);
    auto expected = juce::AudioBuffer<float> (1, 128);
    fillTestSignal (buffer);
    expected.makeCopyOf (buffer);
    juce::MidiBuffer midi;
    monoProcessor.processBlock (buffer, midi);
    const auto difference = maximumDifference (buffer, expected);
    if (! allFinite (buffer) || ! std::isfinite (difference) || difference < 1.0e-3f)
    {
        std::cerr << "mono processing did not produce a finite effect signal\n";
        return false;
    }

    return true;
}

bool checkHostTempoSync()
{
    Processor processor;
    FixedPlayHead playHead;
    playHead.position.setBpm (60.0);
    playHead.position.setIsPlaying (true);
    processor.setPlayHead (&playHead);
    processor.prepareToPlay (48000.0, 64);

    if (! setActual (processor, openfad::params::id::speedMode, 4.0f)
        || ! setActual (processor, openfad::params::id::syncDivision, 0.0f)
        || ! setActual (processor, openfad::params::id::motion, 1.0f)
        || ! setActual (processor, openfad::params::id::depth, 1.0f)
        || ! setActual (processor, openfad::params::id::inertia, 0.05f)
        || ! setActual (processor, openfad::params::id::modelAmount, 0.0f)
        || ! setActual (processor, openfad::params::id::rotatorAmount, 0.0f)
        || ! setActual (processor, openfad::params::id::dopplerAmount, 0.0f)
        || ! setActual (processor, openfad::params::id::dreamBypass, 1.0f)
        || ! setActual (processor, openfad::params::id::mix, 1.0f))
    {
        std::cerr << "could not configure sync probe\n";
        return false;
    }

    auto buffer = juce::AudioBuffer<float> (2, 64);
    buffer.clear();
    juce::MidiBuffer midi;
    for (int block = 0; block < 500; ++block)
        processor.processBlock (buffer, midi);
    const auto rateAt60 = processor.getDSP().getRotorRate();

    playHead.position.setBpm (120.0);
    for (int block = 0; block < 500; ++block)
        processor.processBlock (buffer, midi);
    const auto rateAt120 = processor.getDSP().getRotorRate();

    if (! processor.isPlaying()
        || ! std::isfinite (rateAt60)
        || ! std::isfinite (rateAt120)
        || rateAt60 < 0.01f
        || rateAt120 < rateAt60 * 1.8f)
    {
        std::cerr << "host tempo sync mismatch; 60 BPM=" << rateAt60
                  << " 120 BPM=" << rateAt120 << "\n";
        return false;
    }

    processor.setPlayHead (nullptr);
    return true;
}

bool checkProgramsAndStateRoundTrip()
{
    Processor processor;
    if (! checkParameterContract (processor))
        return false;

    processor.setCurrentProgram (5);
    if (processor.getCurrentProgram() != 5
        || std::abs (actualValue (processor, openfad::params::id::model) - 7.0f) > 1.0e-4f
        || std::abs (actualValue (processor, openfad::params::id::speedMode) - 4.0f) > 1.0e-4f)
    {
        std::cerr << "factory program did not write expected values\n";
        return false;
    }

    if (! setActual (processor, openfad::params::id::dopplerAmount, 0.37f)
        || ! setActual (processor, openfad::params::id::rotatorAmount, 0.12f)
        || ! setActual (processor, openfad::params::id::mix, 0.63f))
    {
        std::cerr << "custom state values could not be written\n";
        return false;
    }

    juce::MemoryBlock state;
    processor.getStateInformation (state);
    Processor restored;
    restored.setStateInformation (state.getData(), static_cast<int> (state.getSize()));
    if (restored.getCurrentProgram() != 5
        || std::abs (actualValue (restored, openfad::params::id::dopplerAmount) - 0.37f) > 1.0e-3f
        || std::abs (actualValue (restored, openfad::params::id::rotatorAmount) - 0.12f) > 1.0e-3f
        || std::abs (actualValue (restored, openfad::params::id::mix) - 0.63f) > 1.0e-3f)
    {
        std::cerr << "state round-trip did not restore program and parameters\n";
        return false;
    }

    const auto preset = juce::File::getSpecialLocation (juce::File::tempDirectory)
                            .getChildFile ("openfad-rotator-contract-test.ofr.json");
    preset.deleteFile();
    const auto saved = processor.savePresetFile (preset, "contract-test");
    if (! saved || ! preset.existsAsFile())
    {
        std::cerr << "preset save failed\n";
        preset.deleteFile();
        return false;
    }

    setActual (processor, openfad::params::id::dopplerAmount, 0.0f);
    const auto loaded = processor.loadPresetFile (preset);
    preset.deleteFile();
    if (! loaded || std::abs (actualValue (processor, openfad::params::id::dopplerAmount) - 0.37f) > 1.0e-3f)
    {
        std::cerr << "preset round-trip did not restore Doppler Amount\n";
        return false;
    }

    return true;
}

bool checkDefaultAudioChain()
{
    Processor processor;
    processor.prepareToPlay (48000.0, 256);

    auto buffer = juce::AudioBuffer<float> (2, 256);
    auto expected = juce::AudioBuffer<float> (2, 256);
    fillTestSignal (buffer);
    expected.makeCopyOf (buffer);
    juce::MidiBuffer midi;
    processor.processBlock (buffer, midi);

    const auto difference = maximumDifference (buffer, expected);
    if (! allFinite (buffer) || ! std::isfinite (difference) || difference < 1.0e-3f)
    {
        std::cerr << "processor default chain did not change audio; max difference="
                  << difference << "\n";
        return false;
    }

    if (std::abs (actualValue (processor, openfad::params::id::speedMode) - 1.0f) > 1.0e-4f
        || std::abs (actualValue (processor, openfad::params::id::model) - 1.0f) > 1.0e-4f
        || std::abs (actualValue (processor, openfad::params::id::dopplerAmount) - 1.0f) > 1.0e-4f)
    {
        std::cerr << "factory defaults were not read back as denormalised values\n";
        return false;
    }

    return true;
}
}

int main()
{
    if (! checkDefaultAudioChain()
        || ! checkStereoAndMonoLayouts()
        || ! checkProgramsAndStateRoundTrip()
        || ! checkHostTempoSync())
        return 1;

    std::cout << "Processor contract checks passed\n";
    return 0;
}
