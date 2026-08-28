#include "PluginProcessor.h"
#include "PluginEditor.h"

#include <BinaryData.h>
#include <juce_audio_utils/juce_audio_utils.h>

#include <algorithm>
#include <cmath>

namespace
{
template <typename T>
T value (const juce::AudioProcessorValueTreeState& state, const char* parameterId, T fallback)
{
    if (const auto* raw = state.getRawParameterValue (parameterId))
    {
        const auto current = raw->load();
        if (std::isfinite (current))
            return static_cast<T> (current);
    }
    return fallback;
}

struct FactoryProgram
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
};

const std::array<FactoryProgram, 8>& factoryPrograms()
{
    static const auto programs = []
    {
        std::array<FactoryProgram, 8> values {};

        values[0].model = 1;
        values[0].speedMode = 1;
        values[0].depth = 0.45f;
        values[0].motion = 0.25f;
        values[0].character = 0.28f;
        values[0].mix = 0.35f;

        values[1] = values[0];
        values[1].drive = 0.28f;
        values[1].inertia = 3.8f;
        values[1].depth = 0.38f;
        values[1].speedMode = 3;
        values[1].freeRate = 0.42f;
        values[1].model = 1;

        values[2] = values[0];
        values[2].model = 2;
        values[2].structure = 0;
        values[2].speedMode = 2;
        values[2].freeRate = 6.5f;
        values[2].depth = 0.68f;
        values[2].motion = 0.45f;
        values[2].character = 0.5f;
        values[2].mix = 0.42f;

        values[3] = values[0];
        values[3].model = 5;
        values[3].structure = 1;
        values[3].speedMode = 3;
        values[3].freeRate = 3.2f;
        values[3].depth = 0.58f;
        values[3].distance = 0.85f;
        values[3].motion = 0.5f;
        values[3].character = 0.58f;

        values[4] = values[0];
        values[4].model = 3;
        values[4].quality = 1;
        values[4].structure = 1;
        values[4].speedMode = 3;
        values[4].freeRate = 0.32f;
        values[4].depth = 0.52f;
        values[4].space = 0.72f;
        values[4].dream = 0.58f;
        values[4].diffusion = 0.62f;
        values[4].tail = 5.0f;
        values[4].microshift = 9.0f;
        values[4].character = 0.48f;
        values[4].motion = 0.72f;
        values[4].mix = 0.48f;

        values[5] = values[4];
        values[5].model = 7;
        values[5].structure = 2;
        values[5].speedMode = 4;
        values[5].syncDivision = 5;
        values[5].freeRate = 0.8f;
        values[5].depth = 0.78f;
        values[5].space = 0.86f;
        values[5].dream = 0.72f;
        values[5].diffusion = 0.78f;
        values[5].tail = 8.0f;
        values[5].feedback = 0.72f;
        values[5].character = 0.62f;
        values[5].motion = 0.8f;
        values[5].mix = 0.58f;

        values[6] = values[4];
        values[6].model = 0;
        values[6].quality = 1;
        values[6].speedMode = 0;
        values[6].depth = 0.2f;
        values[6].space = 0.82f;
        values[6].dream = 0.9f;
        values[6].diffusion = 0.9f;
        values[6].tail = 10.0f;
        values[6].feedback = 0.82f;
        values[6].freeze = true;
        values[6].character = 0.55f;
        values[6].motion = 0.2f;
        values[6].mix = 0.65f;

        values[7] = values[5];
        values[7].model = 6;
        values[7].quality = 1;
        values[7].structure = 2;
        values[7].speedMode = 2;
        values[7].freeRate = 9.0f;
        values[7].depth = 1.0f;
        values[7].space = 1.0f;
        values[7].dream = 1.0f;
        values[7].diffusion = 0.86f;
        values[7].tail = 12.0f;
        values[7].feedback = 0.9f;
        values[7].character = 0.95f;
        values[7].motion = 1.0f;
        values[7].mix = 0.72f;

        return values;
    }();

    return programs;
}

openfad::RotatorDSP::SpeakerProfiles loadSpeakerProfiles()
{
    auto profiles = openfad::RotatorDSP::defaultSpeakerProfiles();
    const auto parsed = juce::JSON::parse (juce::String::fromUTF8 (OpenFADWeb::profiles_json,
                                                                    OpenFADWeb::profiles_jsonSize));
    if (! parsed.isObject())
        return profiles;

    const auto entries = parsed.getProperty ("profiles", juce::var());
    if (! entries.isArray())
        return profiles;

    const auto* array = entries.getArray();
    if (array == nullptr)
        return profiles;

    for (int index = 0; index < std::min (array->size(), static_cast<int> (profiles.size())); ++index)
    {
        const auto* object = (*array)[index].getDynamicObject();
        if (object == nullptr)
            continue;

        auto finiteClamped = [] (const juce::var& value, float fallback, float minimum, float maximum)
        {
            const auto number = static_cast<double> (value);
            return std::isfinite (number)
                ? std::clamp (static_cast<float> (number), minimum, maximum)
                : fallback;
        };

        auto& profile = profiles[static_cast<size_t> (index)];
        profile.lowCut = finiteClamped (object->getProperty ("lowCut"), profile.lowCut, 0.0001f, 0.99f);
        profile.highCut = finiteClamped (object->getProperty ("highCut"), profile.highCut, 0.0001f, 0.99f);
        profile.lowGain = finiteClamped (object->getProperty ("lowGain"), profile.lowGain, 0.1f, 4.0f);
        profile.midGain = finiteClamped (object->getProperty ("midGain"), profile.midGain, 0.1f, 4.0f);
        profile.highGain = finiteClamped (object->getProperty ("highGain"), profile.highGain, 0.1f, 4.0f);
    }

    return profiles;
}

void setStateParameterNormalized (juce::ValueTree state, const char* parameterId, float normalizedValue)
{
    if (! state.isValid())
        return;

    if (state.getProperty ("id").toString() == parameterId)
    {
        state.setProperty ("value", juce::jlimit (0.0f, 1.0f, normalizedValue), nullptr);
        return;
    }

    for (int index = 0; index < state.getNumChildren(); ++index)
        setStateParameterNormalized (state.getChild (index), parameterId, normalizedValue);
}
}

OpenFADRotatorAudioProcessor::OpenFADRotatorAudioProcessor()
    : AudioProcessor (BusesProperties()
                          .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                          .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      parameters (*this, nullptr, "PARAMETERS", openfad::params::createParameterLayout())
{
    applyProgram (0);
    dsp.setSpeakerProfiles (loadSpeakerProfiles());
    currentPresetName = getProgramName (currentProgram);
}

bool OpenFADRotatorAudioProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto output = layouts.getMainOutputChannelSet();
    const auto input = layouts.getMainInputChannelSet();
    if (output != juce::AudioChannelSet::mono() && output != juce::AudioChannelSet::stereo())
        return false;
    // This processor is an audio effect, so a disabled main input would make
    // processBlock clear the output and silently produce silence. Keep the
    // input bus active and let hosts negotiate mono or stereo layouts only.
    return input == juce::AudioChannelSet::mono()
        || input == juce::AudioChannelSet::stereo();
}

void OpenFADRotatorAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate;
    dsp.prepare (sampleRate, samplesPerBlock, getTotalNumOutputChannels());
}

void OpenFADRotatorAudioProcessor::releaseResources()
{
    dsp.reset();
}

openfad::RotatorDSP::Params OpenFADRotatorAudioProcessor::readParams() const
{
    openfad::RotatorDSP::Params p;
    p.inputTrimDb = value<float> (parameters, openfad::params::id::inputTrim, 0.0f);
    p.outputTrimDb = value<float> (parameters, openfad::params::id::outputTrim, 0.0f);
    p.mix = value<float> (parameters, openfad::params::id::mix, 0.35f);
    p.bypass = value<float> (parameters, openfad::params::id::bypass, 0.0f) > 0.5f;
    p.quality = readChoice (openfad::params::id::quality, 0, 1);
    p.model = readChoice (openfad::params::id::model, 1, 7);
    p.modelBypass = value<float> (parameters, openfad::params::id::modelBypass, 0.0f) > 0.5f;
    p.drive = value<float> (parameters, openfad::params::id::drive, 0.2f);
    p.resonance = value<float> (parameters, openfad::params::id::resonance, 0.35f);
    p.damping = value<float> (parameters, openfad::params::id::damping, 0.5f);
    p.loudnessMatch = value<float> (parameters, openfad::params::id::loudnessMatch, 1.0f) > 0.5f;
    p.structure = readChoice (openfad::params::id::structure, 0, 2);
    p.feedMode = readChoice (openfad::params::id::feedMode, 0, 2);
    p.renderMode = readChoice (openfad::params::id::renderMode, 0, 1);
    p.speedMode = readChoice (openfad::params::id::speedMode, 1, 4);
    p.freeRate = value<float> (parameters, openfad::params::id::freeRate, 0.8f);
    p.syncDivision = readChoice (openfad::params::id::syncDivision, 5, 8);
    p.inertia = value<float> (parameters, openfad::params::id::inertia, 2.2f);
    p.direction = readChoice (openfad::params::id::direction, 0, 1);
    p.depth = value<float> (parameters, openfad::params::id::depth, 0.75f);
    p.distance = value<float> (parameters, openfad::params::id::distance, 1.2f);
    p.angle = value<float> (parameters, openfad::params::id::angle, 0.0f);
    p.earlyReflections = value<float> (parameters, openfad::params::id::earlyReflections, 0.25f);
    p.roomDamping = value<float> (parameters, openfad::params::id::roomDamping, 0.55f);
    p.modelAmount = value<float> (parameters, openfad::params::id::modelAmount, 1.0f);
    p.rotatorAmount = value<float> (parameters, openfad::params::id::rotatorAmount, 1.0f);
    p.dopplerAmount = value<float> (parameters, openfad::params::id::dopplerAmount, 1.0f);
    p.dreamBypass = value<float> (parameters, openfad::params::id::dreamBypass, 0.0f) > 0.5f;
    p.predelay = value<float> (parameters, openfad::params::id::predelay, 0.035f);
    p.predelaySync = value<float> (parameters, openfad::params::id::predelaySync, 0.0f) > 0.5f;
    p.diffusion = value<float> (parameters, openfad::params::id::diffusion, 0.45f);
    p.tail = value<float> (parameters, openfad::params::id::tail, 3.5f);
    p.microshift = value<float> (parameters, openfad::params::id::microshift, 8.0f);
    p.dreamDamping = value<float> (parameters, openfad::params::id::dreamDamping, 0.35f);
    p.feedback = value<float> (parameters, openfad::params::id::feedback, 0.58f);
    p.freeze = value<float> (parameters, openfad::params::id::freeze, 0.0f) > 0.5f
            || midiFreeze.load (std::memory_order_relaxed) > 0.5f;
    p.character = value<float> (parameters, openfad::params::id::character, 0.35f);
    p.motion = value<float> (parameters, openfad::params::id::motion, 0.35f);
    p.space = value<float> (parameters, openfad::params::id::space, 0.3f);
    p.dream = value<float> (parameters, openfad::params::id::dream, 0.25f);

    if (auto* playHead = getPlayHead())
    {
        if (auto position = playHead->getPosition())
        {
            if (auto bpm = position->getBpm())
                if (std::isfinite (*bpm))
                    p.bpm = *bpm;
        }
    }
    return p;
}

int OpenFADRotatorAudioProcessor::readChoice (const char* parameterId,
                                              int fallback,
                                              int maximumIndex) const
{
    const auto* parameter = parameters.getParameter (parameterId);
    const auto* raw = parameters.getRawParameterValue (parameterId);
    if (parameter == nullptr || raw == nullptr)
        return fallback;

    // APVTS exposes the denormalised value through getRawParameterValue().
    // AudioParameterChoice therefore returns its integer index directly; it
    // must not be converted from 0..1 a second time.
    const auto actual = raw->load();
    if (std::isfinite (actual))
        return juce::jlimit (0, maximumIndex, juce::roundToInt (actual));

    return fallback;
}

void OpenFADRotatorAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;

    // Program/state changes arrive on the message thread. Keep the MIDI note
    // table audio-thread owned and apply the request at a callback boundary.
    if (midiFreezeClearRequested.exchange (false, std::memory_order_acq_rel))
        clearMidiFreezeOnAudioThread();

    const auto totalInputChannels = getTotalNumInputChannels();
    const auto totalOutputChannels = getTotalNumOutputChannels();
    for (int channel = totalInputChannels; channel < totalOutputChannels; ++channel)
        buffer.clear (channel, 0, buffer.getNumSamples());

    for (const auto metadata : midi)
        updateMidiFreeze (metadata.getMessage());

    auto isCurrentlyPlaying = false;
    if (auto* playHead = getPlayHead())
        if (auto position = playHead->getPosition())
            isCurrentlyPlaying = position->getIsPlaying();

    playing.store (isCurrentlyPlaying, std::memory_order_relaxed);
    dsp.process (buffer, readParams(), isCurrentlyPlaying);
    audioProcessSequence.fetch_add (1u, std::memory_order_relaxed);
}

void OpenFADRotatorAudioProcessor::setCurrentProgram (int index)
{
    currentProgram = juce::jlimit (0, getNumPrograms() - 1, index);
    currentPresetName = getProgramName (currentProgram);
    applyProgram (currentProgram);
}

const juce::String OpenFADRotatorAudioProcessor::getProgramName (int index)
{
    static const juce::StringArray names {
        "Gentle Rotation", "Console Slow", "Cinema Motion", "Nearfield Tremolo",
        "Coral Drift", "Prism Air", "Still Bloom", "Axis Break"
    };
    return names[juce::jlimit (0, names.size() - 1, index)];
}

void OpenFADRotatorAudioProcessor::applyProgram (int index)
{
    const auto safeIndex = juce::jlimit (0, 7, index);
    const auto& preset = factoryPrograms()[static_cast<size_t> (safeIndex)];

    const auto set = [this] (const char* parameterId, float actualValue)
    {
        if (auto* parameter = parameters.getParameter (parameterId))
            if (auto* ranged = dynamic_cast<juce::RangedAudioParameter*> (parameter))
                parameter->setValueNotifyingHost (ranged->getNormalisableRange().convertTo0to1 (actualValue));
    };

    set (openfad::params::id::inputTrim, preset.inputTrimDb);
    set (openfad::params::id::outputTrim, preset.outputTrimDb);
    set (openfad::params::id::mix, preset.mix);
    set (openfad::params::id::bypass, preset.bypass ? 1.0f : 0.0f);
    set (openfad::params::id::quality, static_cast<float> (preset.quality));
    set (openfad::params::id::model, static_cast<float> (preset.model));
    set (openfad::params::id::modelBypass, preset.modelBypass ? 1.0f : 0.0f);
    set (openfad::params::id::drive, preset.drive);
    set (openfad::params::id::resonance, preset.resonance);
    set (openfad::params::id::damping, preset.damping);
    set (openfad::params::id::loudnessMatch, preset.loudnessMatch ? 1.0f : 0.0f);
    set (openfad::params::id::structure, static_cast<float> (preset.structure));
    set (openfad::params::id::feedMode, static_cast<float> (preset.feedMode));
    set (openfad::params::id::renderMode, static_cast<float> (preset.renderMode));
    set (openfad::params::id::speedMode, static_cast<float> (preset.speedMode));
    set (openfad::params::id::freeRate, preset.freeRate);
    set (openfad::params::id::syncDivision, static_cast<float> (preset.syncDivision));
    set (openfad::params::id::inertia, preset.inertia);
    set (openfad::params::id::direction, static_cast<float> (preset.direction));
    set (openfad::params::id::depth, preset.depth);
    set (openfad::params::id::distance, preset.distance);
    set (openfad::params::id::angle, preset.angle);
    set (openfad::params::id::earlyReflections, preset.earlyReflections);
    set (openfad::params::id::roomDamping, preset.roomDamping);
    set (openfad::params::id::modelAmount, preset.modelAmount);
    set (openfad::params::id::rotatorAmount, preset.rotatorAmount);
    set (openfad::params::id::dopplerAmount, preset.dopplerAmount);
    set (openfad::params::id::dreamBypass, preset.dreamBypass ? 1.0f : 0.0f);
    set (openfad::params::id::predelay, preset.predelay);
    set (openfad::params::id::predelaySync, preset.predelaySync ? 1.0f : 0.0f);
    set (openfad::params::id::diffusion, preset.diffusion);
    set (openfad::params::id::tail, preset.tail);
    set (openfad::params::id::microshift, preset.microshift);
    set (openfad::params::id::dreamDamping, preset.dreamDamping);
    set (openfad::params::id::feedback, preset.feedback);
    set (openfad::params::id::freeze, preset.freeze ? 1.0f : 0.0f);
    set (openfad::params::id::character, preset.character);
    set (openfad::params::id::motion, preset.motion);
    set (openfad::params::id::space, preset.space);
    set (openfad::params::id::dream, preset.dream);

    clearMidiFreeze();
}

void OpenFADRotatorAudioProcessor::updateMidiFreeze (const juce::MidiMessage& message)
{
    if (message.isController() && (message.getControllerNumber() == 120
                                   || message.getControllerNumber() == 123))
    {
        clearMidiFreezeOnAudioThread();
        return;
    }

    if (! message.isNoteOnOrOff())
        return;

    const auto channel = juce::jlimit (1, 16, message.getChannel());
    const auto note = juce::jlimit (0, 127, message.getNoteNumber());
    const auto slot = static_cast<size_t> ((channel - 1) * 128 + note);
    const auto pressed = message.isNoteOn() && message.getVelocity() > 0.0f;

    if (pressed)
    {
        if (heldMidiNotes[slot] == 0)
        {
            heldMidiNotes[slot] = 1;
            ++heldMidiNoteCount;
        }
    }
    else if (heldMidiNotes[slot] != 0)
    {
        heldMidiNotes[slot] = 0;
        heldMidiNoteCount = std::max (0, heldMidiNoteCount - 1);
    }

    midiFreeze.store (heldMidiNoteCount > 0 ? 1.0f : 0.0f, std::memory_order_relaxed);
}

void OpenFADRotatorAudioProcessor::clearMidiFreeze() noexcept
{
    // This method may be called by the editor/message thread. Do not touch
    // the audio-owned note table here; the next processBlock applies it.
    midiFreezeClearRequested.store (true, std::memory_order_release);
    midiFreeze.store (0.0f, std::memory_order_release);
}

void OpenFADRotatorAudioProcessor::clearMidiFreezeOnAudioThread() noexcept
{
    heldMidiNotes.fill (0);
    heldMidiNoteCount = 0;
    midiFreeze.store (0.0f, std::memory_order_relaxed);
}

void OpenFADRotatorAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    auto state = parameters.copyState();
    state.setProperty ("schemaVersion", 1, nullptr);
    state.setProperty ("programIndex", currentProgram, nullptr);
    state.setProperty ("presetName", currentPresetName, nullptr);
    setStateParameterNormalized (state, openfad::params::id::freeze, 0.0f);
    if (auto xml = state.createXml())
        copyXmlToBinary (*xml, destData);
}

void OpenFADRotatorAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary (data, sizeInBytes))
    {
        auto state = juce::ValueTree::fromXml (*xml);
        if (state.isValid())
        {
            currentProgram = juce::jlimit (0, getNumPrograms() - 1,
                                          static_cast<int> (state.getProperty ("programIndex", currentProgram)));
            currentPresetName = state.getProperty ("presetName", getProgramName (currentProgram)).toString();
            setStateParameterNormalized (state, openfad::params::id::freeze, 0.0f);
            parameters.replaceState (state);
            clearMidiFreeze();
        }
    }
}

bool OpenFADRotatorAudioProcessor::savePresetFile (const juce::File& file, const juce::String& name)
{
    auto state = parameters.copyState();
    state.setProperty ("schemaVersion", 1, nullptr);
    state.setProperty ("programIndex", currentProgram, nullptr);
    state.setProperty ("presetName", name.isNotEmpty() ? name : currentPresetName, nullptr);
    setStateParameterNormalized (state, openfad::params::id::freeze, 0.0f);

    auto object = std::make_unique<juce::DynamicObject>();
    object->setProperty ("schemaVersion", 1);
    object->setProperty ("product", getName());
    object->setProperty ("name", juce::var (name.isNotEmpty() ? name : currentPresetName));
    if (auto xml = state.createXml())
        object->setProperty ("stateXml", xml->toString());

    file.getParentDirectory().createDirectory();
    return file.replaceWithText (juce::JSON::toString (juce::var (object.release()), true));
}

bool OpenFADRotatorAudioProcessor::loadPresetFile (const juce::File& file)
{
    const auto parsed = juce::JSON::parse (file.loadFileAsString());
    if (! parsed.isObject())
        return false;

    const auto stateXml = parsed.getProperty ("stateXml", juce::var()).toString();
    if (stateXml.isEmpty())
        return false;

    if (auto xml = juce::XmlDocument::parse (stateXml))
    {
        auto state = juce::ValueTree::fromXml (*xml);
        if (state.isValid())
        {
            currentProgram = juce::jlimit (0, getNumPrograms() - 1,
                                          static_cast<int> (state.getProperty ("programIndex", currentProgram)));
            currentPresetName = parsed.getProperty ("name", getProgramName (currentProgram)).toString();
            setStateParameterNormalized (state, openfad::params::id::freeze, 0.0f);
            parameters.replaceState (state);
            clearMidiFreeze();
            return true;
        }
    }

    return false;
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new OpenFADRotatorAudioProcessor();
}
