#pragma once

#include "PluginProcessor.h"

#include <juce_gui_extra/juce_gui_extra.h>

class OpenFADRotatorAudioProcessorEditor final : public juce::AudioProcessorEditor,
                                                 private juce::AudioProcessorValueTreeState::Listener,
                                                 private juce::Timer
{
public:
    explicit OpenFADRotatorAudioProcessorEditor (OpenFADRotatorAudioProcessor&);
    ~OpenFADRotatorAudioProcessorEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void parameterChanged (const juce::String& parameterID, float newValue) override;
    void timerCallback() override;
    void handleNativeCommand (const juce::Array<juce::var>& args,
                              juce::WebBrowserComponent::NativeFunctionCompletion completion);
    void sendFullState();
    void sendTelemetry();
    void openPresetChooser();
    void savePresetToDefaultLocation();
    void endAllGestures();
    void markStateDirty() noexcept;
    juce::WebBrowserComponent::Options makeBrowserOptions();
    static std::optional<juce::WebBrowserComponent::Resource> provideResource (const juce::String& path);
    static juce::String mimeTypeFor (const juce::String& path);

    OpenFADRotatorAudioProcessor& processor;
    class LocalBrowser final : public juce::WebBrowserComponent
    {
    public:
        explicit LocalBrowser (const Options& options) : WebBrowserComponent (options) {}
        bool pageAboutToLoad (const juce::String& url) override
        {
            return url.startsWith (getResourceProviderRoot()) || url == "about:blank";
        }
        void newWindowAttemptingToLoad (const juce::String&) override {}
    };
    LocalBrowser browser;
    std::atomic<bool> stateDirty { false };
    std::unique_ptr<juce::FileChooser> fileChooser;
    juce::StringArray activeGestures;
    bool wasVisible = false;
    uint32_t lastPresetRevision = 0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (OpenFADRotatorAudioProcessorEditor)
};
