#include <juce_audio_processors_headless/juce_audio_processors_headless.h>
#include <juce_audio_formats/juce_audio_formats.h>

#include <algorithm>
#include <cmath>
#include <cstring>
#include <iostream>
#include <memory>

namespace
{
using juce::AudioPluginFormatManager;
using juce::AudioPluginInstance;
using juce::AudioBuffer;
using juce::AudioFormatReader;
using juce::AudioFormatWriterOptions;
using juce::HostedAudioProcessorParameter;
using juce::MidiBuffer;
using juce::PluginDescription;
using juce::WavAudioFormat;

class TestPlayHead final : public juce::AudioPlayHead
{
public:
    juce::Optional<PositionInfo> getPosition() const override
    {
        return juce::makeOptional (position);
    }

    PositionInfo position;
};

const char* displayNameForId (const char* id) noexcept
{
    struct NamePair
    {
        const char* id;
        const char* name;
    };

    static constexpr NamePair names[] {
        { "inputTrim", "Input Trim" },
        { "outputTrim", "Output Trim" },
        { "mix", "Mix" },
        { "bypass", "Bypass" },
        { "quality", "Quality" },
        { "model", "Speaker Model" },
        { "modelBypass", "Model Bypass" },
        { "drive", "Drive" },
        { "resonance", "Cabinet Resonance" },
        { "damping", "Cabinet Damping" },
        { "loudnessMatch", "Loudness Match" },
        { "structure", "Rotor Structure" },
        { "feedMode", "Feed Mode" },
        { "renderMode", "Render Mode" },
        { "speedMode", "Speed Mode" },
        { "freeRate", "Free Rate" },
        { "syncDivision", "Sync Division" },
        { "inertia", "Inertia" },
        { "direction", "Direction" },
        { "depth", "Rotor Depth" },
        { "distance", "Listener Distance" },
        { "angle", "Listener Angle" },
        { "earlyReflections", "Early Reflections" },
        { "roomDamping", "Room Damping" },
        { "modelAmount", "Model Amount" },
        { "rotatorAmount", "Rotator Amount" },
        { "dopplerAmount", "Doppler Amount" },
        { "dreamBypass", "Dream Bypass" },
        { "predelay", "Dream Predelay" },
        { "predelaySync", "Predelay Sync" },
        { "diffusion", "Diffusion" },
        { "tail", "Dream Tail" },
        { "microshift", "Microshift" },
        { "dreamDamping", "Dream Damping" },
        { "feedback", "Dream Feedback" },
        { "freeze", "Dream Freeze" },
        { "character", "Character" },
        { "motion", "Motion" },
        { "space", "Space" },
        { "dream", "Dream" }
    };

    for (const auto& pair : names)
        if (std::strcmp (pair.id, id) == 0)
            return pair.name;

    return id;
}

bool allFinite (const AudioBuffer<float>& buffer)
{
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
            if (! std::isfinite (buffer.getSample (channel, sample)))
                return false;

    return true;
}

float peak (const AudioBuffer<float>& buffer)
{
    auto result = 0.0f;
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
            result = std::max (result, std::abs (buffer.getSample (channel, sample)));
    return result;
}

float maximumDifference (const AudioBuffer<float>& left,
                         const AudioBuffer<float>& right)
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

void fillSignal (AudioBuffer<float>& buffer, int offset = 0)
{
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
        {
            const auto time = static_cast<float> (offset + sample + channel * 13);
            buffer.setSample (channel, sample,
                              0.27f * std::sin (time * 0.071f)
                              + 0.11f * std::sin (time * 0.017f));
        }
}

HostedAudioProcessorParameter* findParameter (AudioPluginInstance& instance, const char* id)
{
    const auto expectedName = juce::String (displayNameForId (id));
    for (int index = 0; index < instance.getParameters().size(); ++index)
        if (auto* hosted = instance.getHostedParameter (index))
            if (hosted->getName (128).equalsIgnoreCase (expectedName))
                return hosted;

    return nullptr;
}

bool setNormalized (AudioPluginInstance& instance,
                    const char* id,
                    float normalized,
                    bool withGesture = true)
{
    auto* parameter = findParameter (instance, id);
    if (parameter == nullptr)
        return false;

    if (withGesture)
        parameter->beginChangeGesture();
    parameter->setValueNotifyingHost (juce::jlimit (0.0f, 1.0f, normalized));
    if (withGesture)
        parameter->endChangeGesture();
    return true;
}

float normalizedValue (AudioPluginInstance& instance, const char* id, float fallback = 0.0f)
{
    if (auto* parameter = findParameter (instance, id))
        return parameter->getValue();
    return fallback;
}

std::unique_ptr<AudioPluginInstance> createInstance (AudioPluginFormatManager& manager,
                                                     const PluginDescription& description,
                                                     double sampleRate,
                                                     int blockSize,
                                                     const char* label)
{
    juce::String error;
    auto instance = manager.createPluginInstance (description, sampleRate, blockSize, error);
    if (instance == nullptr)
    {
        std::cerr << label << " could not be instantiated: " << error << "\n";
        return nullptr;
    }
    return instance;
}

bool checkDescription (const PluginDescription& description, const juce::File& pluginFile)
{
    if (! description.fileOrIdentifier.isEmpty()
        && ! juce::File (description.fileOrIdentifier).isAChildOf (pluginFile.getParentDirectory())
        && juce::File (description.fileOrIdentifier).getFullPathName()
               != pluginFile.getFullPathName())
    {
        std::cerr << "description points at an unexpected module: "
                  << description.fileOrIdentifier << "\n";
        return false;
    }

    if (! description.name.containsIgnoreCase ("openFAD")
        || ! description.manufacturerName.containsIgnoreCase ("Unpure Bloom")
        || ! description.pluginFormatName.containsIgnoreCase ("VST3")
        || description.isInstrument)
    {
        std::cerr << "unexpected VST3 description: name=" << description.name
                  << " manufacturer=" << description.manufacturerName
                  << " format=" << description.pluginFormatName
                  << " inputs=" << description.numInputChannels
                  << " outputs=" << description.numOutputChannels
                  << " instrument=" << description.isInstrument << "\n";
        return false;
    }

    return true;
}

bool checkParameterContract (AudioPluginInstance& instance)
{
    static constexpr const char* required[] {
        "inputTrim", "outputTrim", "mix", "bypass", "quality", "model",
        "modelBypass", "drive", "resonance", "damping", "loudnessMatch",
        "structure", "feedMode", "renderMode", "speedMode", "freeRate",
        "syncDivision", "inertia", "direction", "depth", "distance", "angle",
        "earlyReflections", "roomDamping", "modelAmount", "rotatorAmount",
        "dopplerAmount", "dreamBypass", "predelay", "predelaySync", "diffusion",
        "tail", "microshift", "dreamDamping", "feedback", "freeze", "character",
        "motion", "space", "dream"
    };

    if (instance.getParameters().size() < 40)
    {
        std::cerr << "too few VST3 parameters: " << instance.getParameters().size()
                  << "\n";
        return false;
    }

    for (const auto* id : required)
        if (findParameter (instance, id) == nullptr)
        {
            std::cerr << "missing VST3 parameter: " << id << "\n";
            return false;
        }

    if (instance.getNumPrograms() != 8
        || instance.getProgramName (5) != juce::String ("Prism Air"))
    {
        std::cerr << "factory program contract mismatch\n";
        return false;
    }

    return true;
}

bool checkAudioPath (AudioPluginInstance& instance)
{
    constexpr auto sampleRate = 48000.0;
    constexpr auto blockSize = 128;
    if (instance.getTotalNumInputChannels() != 2
        || instance.getTotalNumOutputChannels() != 2)
    {
        std::cerr << "VST3 bus contract mismatch: inputs="
                  << instance.getTotalNumInputChannels()
                  << " outputs=" << instance.getTotalNumOutputChannels() << "\n";
        return false;
    }

    instance.setRateAndBufferSizeDetails (sampleRate, blockSize);
    // Set offline mode before preparation so the VST3 ProcessSetup receives
    // the same non-realtime hint a render/export host would provide.
    instance.setNonRealtime (true);
    instance.prepareToPlay (sampleRate, blockSize);

    TestPlayHead playHead;
    playHead.position.setBpm (120.0);
    playHead.position.setIsPlaying (true);
    instance.setPlayHead (&playHead);

    if (! setNormalized (instance, "mix", 1.0f)
        || ! setNormalized (instance, "modelAmount", 1.0f)
        || ! setNormalized (instance, "rotatorAmount", 1.0f)
        || ! setNormalized (instance, "dopplerAmount", 1.0f)
        || ! setNormalized (instance, "dreamBypass", 0.0f)
        || ! setNormalized (instance, "dream", 0.65f)
        || ! setNormalized (instance, "predelay", 0.1f)
        || ! setNormalized (instance, "tail", (5.0f - 0.2f) / (12.0f - 0.2f)))
    {
        std::cerr << "could not configure VST3 audio probe\n";
        return false;
    }

    auto buffer = AudioBuffer<float> (2, blockSize);
    fillSignal (buffer);
    MidiBuffer midi;
    instance.processBlock (buffer, midi);
    const auto firstPeak = peak (buffer);
    auto tailPeak = 0.0f;
    auto finiteTail = true;

    for (int block = 0; block < 96; ++block)
    {
        buffer.clear();
        instance.processBlock (buffer, midi);
        finiteTail = finiteTail && allFinite (buffer);
        tailPeak = std::max (tailPeak, peak (buffer));
    }

    if (! finiteTail || ! std::isfinite (firstPeak) || ! std::isfinite (tailPeak)
        || firstPeak < 1.0e-4f || tailPeak < 1.0e-5f
        || instance.getTailLengthSeconds() < 1.0)
    {
        std::cerr << "VST3 audio path failed: firstPeak=" << firstPeak
                  << " tailPeak=" << tailPeak
                  << " tailSeconds=" << instance.getTailLengthSeconds() << "\n";
        return false;
    }

    instance.setPlayHead (nullptr);
    return true;
}

bool checkStateAndAutomation (AudioPluginInstance& instance)
{
    if (! setNormalized (instance, "dopplerAmount", 0.37f)
        || ! setNormalized (instance, "rotatorAmount", 0.12f)
        || ! setNormalized (instance, "mix", 0.63f)
        || ! setNormalized (instance, "model", 1.0f))
    {
        std::cerr << "VST3 parameter gesture write failed\n";
        return false;
    }

    // VST3 hosts queue automation into the next audio block; flush it before
    // taking a project snapshot, matching the order used by real hosts.
    auto flush = AudioBuffer<float> (2, 128);
    flush.clear();
    MidiBuffer midi;
    instance.processBlock (flush, midi);

    juce::MemoryBlock state;
    instance.getStateInformation (state);
    if (state.isEmpty())
    {
        std::cerr << "VST3 state was empty\n";
        return false;
    }

    if (! setNormalized (instance, "dopplerAmount", 0.0f, false)
        || ! setNormalized (instance, "rotatorAmount", 0.0f, false)
        || ! setNormalized (instance, "mix", 0.0f, false)
        || ! setNormalized (instance, "model", 0.0f, false))
        return false;

    instance.setStateInformation (state.getData(), static_cast<int> (state.getSize()));
    if (std::abs (normalizedValue (instance, "dopplerAmount") - 0.37f) > 1.0e-3f
        || std::abs (normalizedValue (instance, "rotatorAmount") - 0.12f) > 1.0e-3f
        || std::abs (normalizedValue (instance, "mix") - 0.63f) > 1.0e-3f
        || std::abs (normalizedValue (instance, "model") - 1.0f) > 1.0e-3f)
    {
        std::cerr << "VST3 state round-trip failed: doppler="
                  << normalizedValue (instance, "dopplerAmount")
                  << " rotator=" << normalizedValue (instance, "rotatorAmount")
                  << " mix=" << normalizedValue (instance, "mix")
                  << " model=" << normalizedValue (instance, "model") << "\n";
        return false;
    }

    instance.setCurrentProgram (5);
    if (instance.getCurrentProgram() != 5
        || instance.getProgramName (instance.getCurrentProgram()) != juce::String ("Prism Air"))
    {
        std::cerr << "VST3 program write failed\n";
        return false;
    }

    return true;
}

bool checkOfflineExport (AudioPluginFormatManager& manager,
                         const PluginDescription& description)
{
    constexpr auto sampleRate = 48000.0;
    constexpr int blockSize = 256;
    constexpr int inputBlocks = 192;
    constexpr int tailBlocks = 256;
    constexpr int totalBlocks = inputBlocks + tailBlocks;
    constexpr auto expectedDoppler = 0.22f;
    constexpr auto expectedDirection = 1.0f;

    auto instance = createInstance (manager, description, sampleRate, blockSize,
                                    "offline export VST3 instance");
    if (instance == nullptr)
        return false;

    instance->setRateAndBufferSizeDetails (sampleRate, blockSize);
    instance->setNonRealtime (true);
    instance->prepareToPlay (sampleRate, blockSize);

    TestPlayHead playHead;
    playHead.position.setBpm (120.0);
    playHead.position.setIsPlaying (true);
    instance->setPlayHead (&playHead);

    if (! setNormalized (*instance, "mix", 1.0f)
        || ! setNormalized (*instance, "modelAmount", 1.0f)
        || ! setNormalized (*instance, "rotatorAmount", 1.0f)
        || ! setNormalized (*instance, "dopplerAmount", 0.15f)
        || ! setNormalized (*instance, "dreamBypass", 0.0f)
        || ! setNormalized (*instance, "dream", 0.72f)
        || ! setNormalized (*instance, "predelay", 0.08f)
        || ! setNormalized (*instance, "tail", (6.0f - 0.2f) / (12.0f - 0.2f)))
    {
        std::cerr << "could not configure VST3 offline export probe\n";
        return false;
    }

    const auto outputFile = juce::File::getSpecialLocation (juce::File::tempDirectory)
                                .getNonexistentChildFile ("openfad-rotator-host-export", ".wav");
    const auto cleanup = [&] { outputFile.deleteFile(); };

    auto fileStream = std::make_unique<juce::FileOutputStream> (outputFile);
    if (fileStream == nullptr || fileStream->failedToOpen())
    {
        std::cerr << "could not open VST3 offline export file\n";
        cleanup();
        return false;
    }

    std::unique_ptr<juce::OutputStream> stream = std::move (fileStream);

    WavAudioFormat wav;
    auto writerOptions = AudioFormatWriterOptions {}
                             .withSampleRate (sampleRate)
                             .withNumChannels (2)
                             .withBitsPerSample (24)
                             .withSampleFormat (AudioFormatWriterOptions::SampleFormat::integral)
                             .withMetadata ("Software", "openFAD Rotator host smoke");
    auto writer = wav.createWriterFor (stream, writerOptions);
    if (writer == nullptr)
    {
        std::cerr << "could not create VST3 offline export writer\n";
        cleanup();
        return false;
    }

    auto buffer = AudioBuffer<float> (2, blockSize);
    MidiBuffer midi;
    juce::MemoryBlock projectState;
    bool stateCaptured = false;
    bool stateRestored = false;
    bool finite = true;
    bool wroteAllBlocks = true;
    auto renderedPeak = 0.0f;
    auto renderedTailPeak = 0.0f;

    for (int block = 0; block < totalBlocks; ++block)
    {
        // These writes model host automation events arriving between blocks.
        if (block == 16)
            setNormalized (*instance, "dopplerAmount", expectedDoppler);
        if (block == 48)
            setNormalized (*instance, "direction", expectedDirection);
        if (block == 80)
        {
            instance->getStateInformation (projectState);
            stateCaptured = ! projectState.isEmpty();
            setNormalized (*instance, "dopplerAmount", 0.0f, false);
            setNormalized (*instance, "direction", 0.0f, false);
            setNormalized (*instance, "mix", 0.0f, false);
        }
        if (block == 128 && stateCaptured)
        {
            instance->setStateInformation (projectState.getData(),
                                            static_cast<int> (projectState.getSize()));
            stateRestored = std::abs (normalizedValue (*instance, "dopplerAmount") - expectedDoppler) < 1.0e-3f
                         && std::abs (normalizedValue (*instance, "direction") - expectedDirection) < 1.0e-3f
                         && std::abs (normalizedValue (*instance, "mix") - 1.0f) < 1.0e-3f;
        }
        if (block == 160)
        {
            playHead.position.setBpm (90.0);
            setNormalized (*instance, "speedMode", 4.0f / 4.0f);
        }

        if (block < inputBlocks)
            fillSignal (buffer, block * blockSize);
        else
            buffer.clear();

        instance->processBlock (buffer, midi);
        finite = finite && allFinite (buffer);
        renderedPeak = std::max (renderedPeak, peak (buffer));
        if (block >= inputBlocks)
            renderedTailPeak = std::max (renderedTailPeak, peak (buffer));
        wroteAllBlocks = wroteAllBlocks
                      && writer->writeFromAudioSampleBuffer (buffer, 0, blockSize);
    }

    writer.reset();
    instance->setPlayHead (nullptr);

    const auto expectedSamples = static_cast<juce::int64> (totalBlocks) * blockSize;
    juce::AudioFormatManager readerManager;
    readerManager.registerBasicFormats();
    std::unique_ptr<AudioFormatReader> reader (readerManager.createReaderFor (outputFile));
    auto decoded = AudioBuffer<float> (2, static_cast<int> (expectedSamples));
    const auto readOk = reader != nullptr
                     && reader->numChannels == 2
                     && std::abs (reader->sampleRate - sampleRate) < 0.01
                     && reader->lengthInSamples == expectedSamples
                     && reader->read (&decoded, 0, static_cast<int> (expectedSamples), 0, true, true);
    const auto decodedPeak = peak (decoded);
    const auto valid = stateCaptured && stateRestored && finite && wroteAllBlocks && readOk
                    && outputFile.existsAsFile() && outputFile.getSize() > 44
                    && std::isfinite (renderedPeak) && renderedPeak > 1.0e-4f
                    && std::isfinite (renderedTailPeak) && renderedTailPeak > 1.0e-5f
                    && std::isfinite (decodedPeak) && decodedPeak > 1.0e-4f;

    if (! valid)
    {
        std::cerr << "VST3 offline export failed: stateCaptured=" << stateCaptured
                  << " stateRestored=" << stateRestored
                  << " finite=" << finite
                  << " wroteAllBlocks=" << wroteAllBlocks
                  << " readOk=" << readOk
                  << " renderedPeak=" << renderedPeak
                  << " renderedTailPeak=" << renderedTailPeak
                  << " decodedPeak=" << decodedPeak << "\n";
        cleanup();
        return false;
    }

    std::cout << "VST3 offline export passed: samples=" << expectedSamples
              << " stateReload=1 peak=" << renderedPeak
              << " tailPeak=" << renderedTailPeak << "\n";
    cleanup();
    return true;
}

bool checkMultiInstanceIsolation (AudioPluginFormatManager& manager,
                                  const PluginDescription& description)
{
    auto first = createInstance (manager, description, 48000.0, 128, "first VST3 instance");
    auto second = createInstance (manager, description, 48000.0, 128, "second VST3 instance");
    if (first == nullptr || second == nullptr)
        return false;

    first->prepareToPlay (48000.0, 128);
    second->prepareToPlay (48000.0, 128);
    if (! setNormalized (*first, "model", 0.0f)
        || ! setNormalized (*second, "model", 1.0f)
        || ! setNormalized (*first, "angle", (-35.0f + 45.0f) / 90.0f)
        || ! setNormalized (*second, "angle", (35.0f + 45.0f) / 90.0f)
        || ! setNormalized (*first, "mix", 1.0f)
        || ! setNormalized (*second, "mix", 1.0f)
        || ! setNormalized (*first, "dreamBypass", 1.0f)
        || ! setNormalized (*second, "dreamBypass", 1.0f)
        || ! setNormalized (*first, "rotatorAmount", 0.0f)
        || ! setNormalized (*second, "rotatorAmount", 0.0f)
        || ! setNormalized (*first, "dopplerAmount", 0.0f)
        || ! setNormalized (*second, "dopplerAmount", 0.0f))
    {
        std::cerr << "could not configure VST3 multi-instance probe\n";
        return false;
    }

    auto firstBuffer = AudioBuffer<float> (2, 128);
    auto secondBuffer = AudioBuffer<float> (2, 128);
    fillSignal (firstBuffer);
    secondBuffer.makeCopyOf (firstBuffer);
    MidiBuffer midi;
    first->processBlock (firstBuffer, midi);
    second->processBlock (secondBuffer, midi);

    if (! allFinite (firstBuffer) || ! allFinite (secondBuffer)
        || maximumDifference (firstBuffer, secondBuffer) < 1.0e-4f
        || std::abs (normalizedValue (*first, "model") - 0.0f) > 1.0e-3f
        || std::abs (normalizedValue (*second, "model") - 1.0f) > 1.0e-3f
        || std::abs (normalizedValue (*first, "angle") - ((-35.0f + 45.0f) / 90.0f)) > 1.0e-3f
        || std::abs (normalizedValue (*second, "angle") - ((35.0f + 45.0f) / 90.0f)) > 1.0e-3f)
    {
        std::cerr << "VST3 instance state leaked between wrappers\n";
        return false;
    }

    return true;
}
}

int main (int argc, char** argv)
{
    if (argc < 2)
    {
        std::cerr << "usage: openFADRotator_VST3HostSmoke <path-to-vst3-bundle>\n";
        return 2;
    }

    const auto pluginPath = juce::String::fromUTF8 (argv[1]);
    auto pluginFile = juce::File (pluginPath);
    if (! juce::File::isAbsolutePath (pluginPath))
        pluginFile = juce::File::getCurrentWorkingDirectory().getChildFile (pluginPath);
    pluginFile = pluginFile.getLinkedTarget();
    if (! pluginFile.exists())
    {
        std::cerr << "VST3 bundle does not exist: " << pluginFile.getFullPathName() << "\n";
        return 2;
    }

    AudioPluginFormatManager manager;
    juce::addHeadlessDefaultFormatsToManager (manager);
    juce::OwnedArray<PluginDescription> descriptions;
    for (int index = 0; index < manager.getNumFormats(); ++index)
    {
        auto* format = manager.getFormat (index);
        if (format == nullptr || ! format->getName().containsIgnoreCase ("VST3")
            || ! format->fileMightContainThisPluginType (pluginFile.getFullPathName()))
            continue;

        format->findAllTypesForFile (descriptions, pluginFile.getFullPathName());
    }

    if (descriptions.size() != 1)
    {
        std::cerr << "expected one VST3 description, found " << descriptions.size() << "\n";
        return 1;
    }

    const auto& description = *descriptions.getFirst();
    if (! checkDescription (description, pluginFile))
        return 1;
    if (! manager.doesPluginStillExist (description))
    {
        std::cerr << "VST3 description no longer resolves to an existing bundle\n";
        return 1;
    }

    auto instance = createInstance (manager, description, 48000.0, 128, "primary VST3 instance");
    if (instance == nullptr
        || ! checkParameterContract (*instance)
        || ! checkAudioPath (*instance)
        || ! checkStateAndAutomation (*instance)
        || ! checkOfflineExport (manager, description)
        || ! checkMultiInstanceIsolation (manager, description))
        return 1;

    std::cout << "VST3 host smoke passed: " << description.name << " / "
              << description.pluginFormatName << " / parameters="
              << instance->getParameters().size() << " / programs="
              << instance->getNumPrograms() << "\n";
    return 0;
}
