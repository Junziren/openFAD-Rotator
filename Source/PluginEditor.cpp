#include "PluginEditor.h"

#include <BinaryData.h>

#include <cmath>

namespace
{
juce::var makeObject (std::initializer_list<std::pair<juce::String, juce::var>> properties)
{
    auto object = std::make_unique<juce::DynamicObject>();
    for (const auto& property : properties)
        object->setProperty (property.first, property.second);
    return juce::var (object.release());
}

juce::var parameterRows (const juce::AudioProcessor& processor)
{
    juce::Array<juce::var> rows;
    for (auto* parameter : processor.getParameters())
    {
        if (auto* ranged = dynamic_cast<juce::RangedAudioParameter*> (parameter))
        {
            auto row = std::make_unique<juce::DynamicObject>();
            row->setProperty ("id", ranged->getParameterID());
            row->setProperty ("name", ranged->getName (64));
            row->setProperty ("value", ranged->getValue());
            row->setProperty ("text", ranged->getCurrentValueAsText());
            row->setProperty ("default", ranged->getDefaultValue());
            rows.add (juce::var (row.release()));
        }
    }
    return juce::var (rows);
}

juce::var speakerProfileRows()
{
    juce::Array<juce::var> rows;
    const auto parsed = juce::JSON::parse (juce::String::fromUTF8 (OpenFADWeb::profiles_json,
                                                                    OpenFADWeb::profiles_jsonSize));
    if (! parsed.isObject())
        return juce::var (rows);

    const auto entries = parsed.getProperty ("profiles", juce::var());
    const auto* array = entries.getArray();
    if (array == nullptr)
        return juce::var (rows);

    for (const auto& entry : *array)
    {
        const auto* source = entry.getDynamicObject();
        if (source == nullptr)
            continue;

        auto row = std::make_unique<juce::DynamicObject>();
        row->setProperty ("id", source->getProperty ("id").toString());
        row->setProperty ("name", source->getProperty ("name").toString());
        row->setProperty ("description", source->getProperty ("description").toString());
        row->setProperty ("lowCut", source->getProperty ("lowCut"));
        row->setProperty ("highCut", source->getProperty ("highCut"));
        row->setProperty ("lowGain", source->getProperty ("lowGain"));
        row->setProperty ("midGain", source->getProperty ("midGain"));
        row->setProperty ("highGain", source->getProperty ("highGain"));
        rows.add (juce::var (row.release()));
    }

    return juce::var (rows);
}

juce::File findWebView2Loader()
{
#if JUCE_WINDOWS
    const auto executable = juce::File::getSpecialLocation (juce::File::currentExecutableFile);
    const auto loader = executable.getParentDirectory().getChildFile ("WebView2Loader.dll");
    if (loader.existsAsFile())
        return loader;
#endif

    return {};
}

double currentBpm (OpenFADRotatorAudioProcessor& processor) noexcept
{
    if (auto* playHead = processor.getPlayHead())
        if (auto position = playHead->getPosition())
            if (auto bpm = position->getBpm())
                if (std::isfinite (*bpm))
                    return juce::jlimit (20.0, 300.0, *bpm);

    return 120.0;
}
}

OpenFADRotatorAudioProcessorEditor::OpenFADRotatorAudioProcessorEditor (OpenFADRotatorAudioProcessor& processorIn)
    : AudioProcessorEditor (processorIn),
      processor (processorIn),
      browser (makeBrowserOptions())
{
    setSize (1100, 760);
    setResizable (true, true);
    setResizeLimits (820, 600, 1800, 1200);
    addAndMakeVisible (browser);
    // Navigate to a concrete document so WebView2 does not treat the provider root
    // as a cancelled top-level navigation on some runtime versions.
    browser.goToURL (juce::WebBrowserComponent::getResourceProviderRoot() + "index.html");

    for (auto* parameter : processor.getParameters())
        if (auto* ranged = dynamic_cast<juce::RangedAudioParameter*> (parameter))
            processor.parameters.addParameterListener (ranged->getParameterID(), this);

    startTimerHz (20);
}

juce::WebBrowserComponent::Options OpenFADRotatorAudioProcessorEditor::makeBrowserOptions()
{
    auto options = juce::WebBrowserComponent::Options()
                       .withNativeIntegrationEnabled()
                       .withKeepPageLoadedWhenBrowserIsHidden()
                       .withResourceProvider (provideResource)
                       .withNativeFunction ("rotatorCommand",
                                            [this] (const juce::Array<juce::var>& args,
                                                    juce::WebBrowserComponent::NativeFunctionCompletion completion)
                                            {
                                                handleNativeCommand (args, std::move (completion));
                                            });

#if JUCE_WINDOWS
    auto webView2 = juce::WebBrowserComponent::Options::WinWebView2()
                         .withStatusBarDisabled()
                         .withBuiltInErrorPageDisabled()
                         .withUserDataFolder (juce::File::getSpecialLocation (juce::File::tempDirectory)
                                                  .getChildFile ("openfad-rotator-webview"));

    if (const auto loader = findWebView2Loader(); loader.existsAsFile())
        webView2 = webView2.withDLLLocation (loader);

    options = options.withBackend (juce::WebBrowserComponent::Options::Backend::webview2)
                     .withWinWebView2Options (webView2);
#else
    options = options.withBackend (juce::WebBrowserComponent::Options::Backend::defaultBackend);
#endif

    return options.withUserScript ("document.addEventListener('contextmenu', e => e.preventDefault());");
}

OpenFADRotatorAudioProcessorEditor::~OpenFADRotatorAudioProcessorEditor()
{
    stopTimer();
    fileChooser.reset();
    for (auto* parameter : processor.getParameters())
        if (auto* ranged = dynamic_cast<juce::RangedAudioParameter*> (parameter))
            processor.parameters.removeParameterListener (ranged->getParameterID(), this);
}

void OpenFADRotatorAudioProcessorEditor::paint (juce::Graphics& graphics)
{
    graphics.fillAll (juce::Colour::fromRGB (17, 19, 26));
}

void OpenFADRotatorAudioProcessorEditor::resized()
{
    browser.setBounds (getLocalBounds());
}

void OpenFADRotatorAudioProcessorEditor::timerCallback()
{
    if (stateDirty.exchange (false, std::memory_order_acq_rel))
        sendFullState();
    sendTelemetry();
}

void OpenFADRotatorAudioProcessorEditor::parameterChanged (const juce::String&, float)
{
    markStateDirty();
}

void OpenFADRotatorAudioProcessorEditor::markStateDirty() noexcept
{
    stateDirty.store (true, std::memory_order_release);
}

void OpenFADRotatorAudioProcessorEditor::handleNativeCommand (
    const juce::Array<juce::var>& args,
    juce::WebBrowserComponent::NativeFunctionCompletion completion)
{
    if (args.isEmpty())
    {
        completion (makeObject ({ { "ok", false }, { "error", "missing command" } }));
        return;
    }

    auto payload = args[0].toString();
    auto parsed = juce::JSON::parse (payload);
    if (! parsed.isObject())
    {
        completion (makeObject ({ { "ok", false }, { "error", "invalid JSON" } }));
        return;
    }

    auto* object = parsed.getDynamicObject();
    const auto type = object->getProperty ("type").toString();
    bool handled = true;
    if (type == "uiReady")
    {
        sendFullState();
    }
    else if (type == "parameter")
    {
        const auto id = object->getProperty ("id").toString();
        const auto phase = object->getProperty ("phase").toString();
        const auto numericValue = static_cast<double> (object->getProperty ("value"));
        if (! std::isfinite (numericValue)
            || (phase != "begin" && phase != "set" && phase != "end"))
        {
            completion (makeObject ({ { "ok", false }, { "error", "invalid parameter gesture" } }));
            return;
        }

        if (auto* parameter = processor.parameters.getParameter (id))
        {
            const auto normalized = static_cast<float> (juce::jlimit (0.0, 1.0, numericValue));
            if (phase == "begin") parameter->beginChangeGesture();
            parameter->setValueNotifyingHost (normalized);
            if (phase == "end") parameter->endChangeGesture();
            markStateDirty();
        }
        else
        {
            completion (makeObject ({ { "ok", false }, { "error", "unknown parameter" } }));
            return;
        }
    }
    else if (type == "program")
    {
        const auto numericIndex = static_cast<double> (object->getProperty ("index"));
        if (! std::isfinite (numericIndex))
        {
            completion (makeObject ({ { "ok", false }, { "error", "invalid program index" } }));
            return;
        }

        processor.setCurrentProgram (juce::jlimit (0, processor.getNumPrograms() - 1,
                                                   juce::roundToInt (numericIndex)));
        markStateDirty();
    }
    else if (type == "previousProgram")
    {
        const auto count = processor.getNumPrograms();
        processor.setCurrentProgram ((processor.getCurrentProgram() + count - 1) % count);
        markStateDirty();
    }
    else if (type == "nextProgram")
    {
        const auto count = processor.getNumPrograms();
        processor.setCurrentProgram ((processor.getCurrentProgram() + 1) % count);
        markStateDirty();
    }
    else if (type == "savePreset")
    {
        savePresetToDefaultLocation();
    }
    else if (type == "openPreset")
    {
        openPresetChooser();
    }
    else
    {
        handled = false;
    }

    completion (makeObject ({ { "ok", handled }, { "error", handled ? juce::var() : juce::var ("unknown command") } }));
}

void OpenFADRotatorAudioProcessorEditor::sendFullState()
{
    auto state = std::make_unique<juce::DynamicObject>();
    state->setProperty ("protocol", 1);
    state->setProperty ("type", "fullState");
    state->setProperty ("product", "openFAD Rotator");
    state->setProperty ("bpm", currentBpm (processor));
    state->setProperty ("parameters", parameterRows (processor));
    state->setProperty ("speakerProfiles", speakerProfileRows());
    state->setProperty ("program", processor.getCurrentProgram());
    state->setProperty ("programName", processor.getCurrentPresetName());
    state->setProperty ("programCount", processor.getNumPrograms());
    browser.emitEventIfBrowserIsVisible ("state", juce::var (state.release()));
}

void OpenFADRotatorAudioProcessorEditor::savePresetToDefaultLocation()
{
    const auto safeName = processor.getCurrentPresetName()
                              .replaceCharacters ("\\/:*?\"<>|", "_________");
    const auto directory = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                                .getChildFile ("openFAD")
                                .getChildFile ("Rotator")
                                .getChildFile ("Presets");
    const auto file = directory.getChildFile (safeName + ".ofr.json");
    const auto saved = processor.savePresetFile (file, processor.getCurrentPresetName());

    auto notice = std::make_unique<juce::DynamicObject>();
    notice->setProperty ("ok", saved);
    notice->setProperty ("message", saved ? "Preset saved" : "Could not save preset");
    browser.emitEventIfBrowserIsVisible ("notice", juce::var (notice.release()));
}

void OpenFADRotatorAudioProcessorEditor::openPresetChooser()
{
    fileChooser = std::make_unique<juce::FileChooser> (
        "Open openFAD Rotator preset",
        juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
            .getChildFile ("openFAD")
            .getChildFile ("Rotator")
            .getChildFile ("Presets"),
        "*.ofr.json;*.json");

    fileChooser->launchAsync (juce::FileBrowserComponent::openMode
                              | juce::FileBrowserComponent::canSelectFiles,
                              [this] (const juce::FileChooser& chooser)
                              {
                                  const auto file = chooser.getResult();
                                  if (file.existsAsFile())
                                  {
                                      const auto loaded = processor.loadPresetFile (file);
                                      markStateDirty();
                                      auto notice = std::make_unique<juce::DynamicObject>();
                                      notice->setProperty ("ok", loaded);
                                      notice->setProperty ("message", loaded ? "Preset loaded" : "Could not load preset");
                                      browser.emitEventIfBrowserIsVisible ("notice", juce::var (notice.release()));
                                  }
                                  fileChooser.reset();
                              });
}

void OpenFADRotatorAudioProcessorEditor::sendTelemetry()
{
    const auto& dsp = processor.getDSP();
    const auto snapshot = dsp.getTelemetrySnapshot();
    auto telemetry = std::make_unique<juce::DynamicObject>();
    telemetry->setProperty ("rotorPhase", snapshot.rotorPhase);
    telemetry->setProperty ("rotorRate", snapshot.rotorRate);
    telemetry->setProperty ("bpm", currentBpm (processor));
    if (const auto* direction = processor.parameters.getRawParameterValue (openfad::params::id::direction))
        telemetry->setProperty ("direction", direction->load());
    telemetry->setProperty ("inputPeak", snapshot.inputPeak);
    telemetry->setProperty ("outputPeak", snapshot.outputPeak);
    telemetry->setProperty ("bands", juce::Array<juce::var> {
        snapshot.bandEnergy[0], snapshot.bandEnergy[1], snapshot.bandEnergy[2]
    });
    telemetry->setProperty ("playing", processor.isPlaying());
    browser.emitEventIfBrowserIsVisible ("telemetry", juce::var (telemetry.release()));
}

std::optional<juce::WebBrowserComponent::Resource>
OpenFADRotatorAudioProcessorEditor::provideResource (const juce::String& requestPath)
{
    auto path = requestPath.trim();

    // WebView2 normally passes a provider-relative path, but some runtime builds
    // pass the full virtual-host URL or append a cache-busting query string.
    if (path.startsWithIgnoreCase ("https://juce.backend"))
        path = path.fromFirstOccurrenceOf ("https://juce.backend", false, false);

    path = path.upToFirstOccurrenceOf ("?", false, false)
               .upToFirstOccurrenceOf ("#", false, false);
    path = juce::URL::removeEscapeChars (path).replaceCharacter ('\\', '/');

    while (path.startsWithChar ('/'))
        path = path.substring (1);

    while (path.startsWith ("./"))
        path = path.substring (2);

    if (path.isEmpty())
        path = "index.html";
    else if (path.endsWithChar ('/'))
        path += "index.html";

    const auto makeBinaryResourceName = [] (juce::String value)
    {
        return value.replaceCharacter ('/', '_')
                    .replaceCharacter ('.', '_')
                    .removeCharacters ("- ");
    };

    const auto resourceName = makeBinaryResourceName (path);
    const auto basename = path.fromLastOccurrenceOf ("/", false, false);
    const auto basenameResourceName = makeBinaryResourceName (basename);
    int size = 0;
    auto lookupName = resourceName;
    auto* raw = OpenFADWeb::getNamedResource (lookupName.toRawUTF8(), size);

    // juce_add_binary_data flattens nested asset paths to their basename. Keep
    // the path-based lookup first, then fall back to the generated symbol name.
    if ((raw == nullptr || size <= 0) && basenameResourceName != resourceName)
    {
        lookupName = basenameResourceName;
        size = 0;
        raw = OpenFADWeb::getNamedResource (lookupName.toRawUTF8(), size);
    }

    if (raw == nullptr || size <= 0)
        return std::nullopt;

    juce::WebBrowserComponent::Resource resource;
    resource.data.assign (reinterpret_cast<const std::byte*> (raw),
                          reinterpret_cast<const std::byte*> (raw) + size);
    resource.mimeType = mimeTypeFor (path);
    return resource;
}

juce::String OpenFADRotatorAudioProcessorEditor::mimeTypeFor (const juce::String& path)
{
    if (path.endsWithIgnoreCase (".html")) return "text/html";
    if (path.endsWithIgnoreCase (".js")) return "text/javascript";
    if (path.endsWithIgnoreCase (".css")) return "text/css";
    if (path.endsWithIgnoreCase (".json")) return "application/json";
    if (path.endsWithIgnoreCase (".woff2")) return "font/woff2";
    if (path.endsWithIgnoreCase (".png")) return "image/png";
    if (path.endsWithIgnoreCase (".svg")) return "image/svg+xml";
    return "application/octet-stream";
}

juce::AudioProcessorEditor* OpenFADRotatorAudioProcessor::createEditor()
{
    return new OpenFADRotatorAudioProcessorEditor (*this);
}
