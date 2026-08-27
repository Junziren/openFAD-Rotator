#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

namespace openfad::params
{
namespace id
{
inline constexpr auto inputTrim = "inputTrim";
inline constexpr auto outputTrim = "outputTrim";
inline constexpr auto mix = "mix";
inline constexpr auto bypass = "bypass";
inline constexpr auto quality = "quality";
inline constexpr auto model = "model";
inline constexpr auto modelBypass = "modelBypass";
inline constexpr auto drive = "drive";
inline constexpr auto resonance = "resonance";
inline constexpr auto damping = "damping";
inline constexpr auto loudnessMatch = "loudnessMatch";
inline constexpr auto structure = "structure";
inline constexpr auto feedMode = "feedMode";
inline constexpr auto renderMode = "renderMode";
inline constexpr auto speedMode = "speedMode";
inline constexpr auto freeRate = "freeRate";
inline constexpr auto syncDivision = "syncDivision";
inline constexpr auto inertia = "inertia";
inline constexpr auto direction = "direction";
inline constexpr auto depth = "depth";
inline constexpr auto distance = "distance";
inline constexpr auto angle = "angle";
inline constexpr auto earlyReflections = "earlyReflections";
inline constexpr auto roomDamping = "roomDamping";
inline constexpr auto modelAmount = "modelAmount";
inline constexpr auto rotatorAmount = "rotatorAmount";
inline constexpr auto dreamBypass = "dreamBypass";
inline constexpr auto predelay = "predelay";
inline constexpr auto predelaySync = "predelaySync";
inline constexpr auto diffusion = "diffusion";
inline constexpr auto tail = "tail";
inline constexpr auto microshift = "microshift";
inline constexpr auto dreamDamping = "dreamDamping";
inline constexpr auto feedback = "feedback";
inline constexpr auto freeze = "freeze";
inline constexpr auto character = "character";
inline constexpr auto motion = "motion";
inline constexpr auto space = "space";
inline constexpr auto dream = "dream";
}

juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();

juce::StringArray modelNames();
juce::StringArray structureNames();
juce::StringArray feedModeNames();
juce::StringArray renderModeNames();
juce::StringArray speedModeNames();
juce::StringArray qualityNames();
juce::StringArray syncDivisionNames();

} // namespace openfad::params
