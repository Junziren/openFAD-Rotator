#include "Parameters.h"

namespace openfad::params
{
namespace
{
using APVTS = juce::AudioProcessorValueTreeState;

std::unique_ptr<juce::AudioParameterFloat> floatParameter (const char* parameterId,
                                                            const char* name,
                                                            float minimum,
                                                            float maximum,
                                                            float defaultValue,
                                                            const char* unit = {})
{
    juce::NormalisableRange<float> range (minimum, maximum);
    return std::make_unique<juce::AudioParameterFloat> (parameterId, name, range, defaultValue, unit);
}

std::unique_ptr<juce::AudioParameterChoice> choiceParameter (const char* parameterId,
                                                              const char* name,
                                                              const juce::StringArray& choices,
                                                              int defaultIndex)
{
    return std::make_unique<juce::AudioParameterChoice> (parameterId, name, choices, defaultIndex);
}

std::unique_ptr<juce::AudioParameterBool> boolParameter (const char* parameterId,
                                                          const char* name,
                                                          bool defaultValue)
{
    return std::make_unique<juce::AudioParameterBool> (parameterId, name, defaultValue);
}
}

juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout()
{
    APVTS::ParameterLayout layout;

    layout.add (floatParameter (id::inputTrim, "Input Trim", -24.0f, 24.0f, 0.0f, "dB"));
    layout.add (floatParameter (id::outputTrim, "Output Trim", -24.0f, 12.0f, 0.0f, "dB"));
    layout.add (floatParameter (id::mix, "Mix", 0.0f, 1.0f, 0.35f));
    layout.add (boolParameter (id::bypass, "Bypass", false));
    layout.add (choiceParameter (id::quality, "Quality", qualityNames(), 0));

    layout.add (choiceParameter (id::model, "Speaker Model", modelNames(), 1));
    layout.add (boolParameter (id::modelBypass, "Model Bypass", false));
    layout.add (floatParameter (id::drive, "Drive", 0.0f, 1.0f, 0.2f));
    layout.add (floatParameter (id::resonance, "Cabinet Resonance", 0.0f, 1.0f, 0.35f));
    layout.add (floatParameter (id::damping, "Cabinet Damping", 0.0f, 1.0f, 0.5f));
    layout.add (boolParameter (id::loudnessMatch, "Loudness Match", true));

    layout.add (choiceParameter (id::structure, "Rotor Structure", structureNames(), 0));
    layout.add (choiceParameter (id::feedMode, "Feed Mode", feedModeNames(), 0));
    layout.add (choiceParameter (id::renderMode, "Render Mode", renderModeNames(), 0));
    layout.add (choiceParameter (id::speedMode, "Speed Mode", speedModeNames(), 1));
    layout.add (floatParameter (id::freeRate, "Free Rate", 0.02f, 20.0f, 0.8f, "Hz"));
    layout.add (choiceParameter (id::syncDivision, "Sync Division", syncDivisionNames(), 5));
    layout.add (floatParameter (id::inertia, "Inertia", 0.05f, 12.0f, 2.2f, "s"));
    layout.add (choiceParameter (id::direction, "Direction", juce::StringArray { "CW", "CCW" }, 0));
    layout.add (floatParameter (id::depth, "Rotor Depth", 0.0f, 1.0f, 0.75f));
    layout.add (floatParameter (id::distance, "Listener Distance", 0.5f, 3.0f, 1.2f, "m"));
    layout.add (floatParameter (id::angle, "Listener Angle", -45.0f, 45.0f, 0.0f, "deg"));
    layout.add (floatParameter (id::earlyReflections, "Early Reflections", 0.0f, 1.0f, 0.25f));
    layout.add (floatParameter (id::roomDamping, "Room Damping", 0.0f, 1.0f, 0.55f));
    layout.add (floatParameter (id::modelAmount, "Model Amount", 0.0f, 1.0f, 1.0f));
    layout.add (floatParameter (id::rotatorAmount, "Rotator Amount", 0.0f, 1.0f, 1.0f));

    layout.add (boolParameter (id::dreamBypass, "Dream Bypass", false));
    layout.add (floatParameter (id::predelay, "Dream Predelay", 0.0f, 0.25f, 0.035f, "s"));
    layout.add (boolParameter (id::predelaySync, "Predelay Sync", false));
    layout.add (floatParameter (id::diffusion, "Diffusion", 0.0f, 1.0f, 0.45f));
    layout.add (floatParameter (id::tail, "Dream Tail", 0.2f, 12.0f, 3.5f, "s"));
    layout.add (floatParameter (id::microshift, "Microshift", 0.0f, 25.0f, 8.0f, "cents"));
    layout.add (floatParameter (id::dreamDamping, "Dream Damping", 0.0f, 1.0f, 0.35f));
    layout.add (floatParameter (id::feedback, "Dream Feedback", 0.0f, 0.96f, 0.58f));
    layout.add (boolParameter (id::freeze, "Dream Freeze", false));

    layout.add (floatParameter (id::character, "Character", 0.0f, 1.0f, 0.35f));
    layout.add (floatParameter (id::motion, "Motion", 0.0f, 1.0f, 0.35f));
    layout.add (floatParameter (id::space, "Space", 0.0f, 1.0f, 0.3f));
    layout.add (floatParameter (id::dream, "Dream", 0.0f, 1.0f, 0.25f));

    // Append new parameters so existing host automation/index ordering remains stable.
    layout.add (floatParameter (id::dopplerAmount, "Doppler Amount", 0.0f, 1.0f, 1.0f));

    return layout;
}

juce::StringArray modelNames()
{
    return { "Pocket Radio", "Console Coax", "Cinema Horn", "British Shelf",
             "American Tower", "Nearfield Monitor", "PA Stack", "Modern Reference" };
}

juce::StringArray structureNames()
{
    return { "Horn + Drum", "Eccentric Ports", "Prism Diffuser" };
}

juce::StringArray feedModeNames()
{
    return { "Mono Sum", "Linked Stereo", "Dual Rotor" };
}

juce::StringArray renderModeNames()
{
    return { "Binaural", "Speaker Stereo" };
}

juce::StringArray speedModeNames()
{
    return { "Stop", "Slow", "Fast", "Free", "Sync" };
}

juce::StringArray qualityNames()
{
    return { "Live", "Studio" };
}

juce::StringArray syncDivisionNames()
{
    return { "1/32", "1/16", "1/8", "1/4", "1/2", "1 bar", "2 bars", "4 bars", "8 bars" };
}

} // namespace openfad::params
