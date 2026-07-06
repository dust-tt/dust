// Completeness map: every stream endpoint must have a corresponding test
// setup here. The `satisfies Record<StreamEndpointId, StreamSetup>` fails to
// type-check when a new endpoint is added to `STREAM_ENDPOINTS` without a
// matching test file exporting its `setup`, forcing the test to be written.
import type { StreamEndpointId } from "@app/lib/model_constructors/stream";
import { AgentPlatformEuropeClaudeHaikuFourDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_haiku_four_dot_five";
import { AgentPlatformEuropeClaudeOpusFourDotEightStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_opus_four_dot_eight";
import { AgentPlatformEuropeClaudeOpusFourDotSevenStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_opus_four_dot_seven";
import { AgentPlatformEuropeClaudeOpusFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_opus_four_dot_six";
import { AgentPlatformEuropeClaudeSonnetFiveStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_sonnet_five";
import { AgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_gemini_3_1_flash_lite";
import { AgentPlatformEuropeGeminiThreeDotFiveFlashStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_gemini_3_5_flash";
import { AnthropicGlobalClaudeFableFiveStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_fable_five";
import { AnthropicGlobalClaudeHaikuFourDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_haiku_four_dot_five";
import { AnthropicGlobalClaudeOpusFourDotEightStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_opus_four_dot_eight";
import { AnthropicGlobalClaudeOpusFourDotSevenStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_opus_four_dot_seven";
import { AnthropicGlobalClaudeOpusFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_opus_four_dot_six";
import { AnthropicGlobalClaudeSonnetFiveStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_sonnet_five";
import { AnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import { FireworksGlobalDeepSeekV4ProStream } from "@app/lib/model_constructors/stream/endpoints/fireworks_global_deepseek_v4_pro";
import { FireworksGlobalGlmFiveDotTwoStream } from "@app/lib/model_constructors/stream/endpoints/fireworks_global_glm_five_dot_two";
import { FireworksGlobalKimiK2Dot5Stream } from "@app/lib/model_constructors/stream/endpoints/fireworks_global_kimi_k2_dot_five";
import { GoogleAiStudioGlobalGeminiThreeDotOneProStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_1_pro";
import { MistralEuropeCodestralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_codestral";
import { MistralEuropeMistralLargeStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_large";
import { MistralEuropeMistralMedium35Stream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_medium_3_5";
import { MistralEuropeMistralSmallStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_small";
import { OpenAIResponsesEuropeGptFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five";
import { OpenAIResponsesEuropeGptFiveDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_five";
import { OpenAIResponsesEuropeGptFiveDotFourStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_four";
import { OpenAIResponsesEuropeGptFiveDotFourMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_four_mini";
import { OpenAIResponsesEuropeGptFiveDotFourNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_four_nano";
import { OpenAIResponsesEuropeGptFiveDotOneStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_one";
import { OpenAIResponsesEuropeGptFiveDotTwoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_two";
import { OpenAIResponsesEuropeGptFiveMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_mini";
import { OpenAIResponsesEuropeGptFiveNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_nano";
import { OpenAIResponsesGlobalGptFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five";
import { OpenAIResponsesGlobalGptFiveDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_five";
import { OpenAIResponsesGlobalGptFiveDotFourStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four";
import { OpenAIResponsesGlobalGptFiveDotFourMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four_mini";
import { OpenAIResponsesGlobalGptFiveDotFourNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four_nano";
import { OpenAIResponsesGlobalGptFiveDotOneStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_one";
import { OpenAIResponsesGlobalGptFiveDotTwoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_two";
import { OpenAIResponsesGlobalGptFiveMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_mini";
import { OpenAIResponsesGlobalGptFiveNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_nano";
import { TogetheraiGlobalLlama3370BInstructTurboStream } from "@app/lib/model_constructors/stream/endpoints/togetherai_global_llama_3_3_70b_instruct_turbo";
import { AgentPlatformEuropeClaudeHaikuFourDotFiveStreamSetup } from "@app/lib/model_constructors/test/endpoints/agent_platform_eu_claude_haiku_four_dot_five.test";
import { AgentPlatformEuropeClaudeOpusFourDotEightStreamSetup } from "@app/lib/model_constructors/test/endpoints/agent_platform_eu_claude_opus_four_dot_eight.test";
import { AgentPlatformEuropeClaudeOpusFourDotSevenStreamSetup } from "@app/lib/model_constructors/test/endpoints/agent_platform_eu_claude_opus_four_dot_seven.test";
import { AgentPlatformEuropeClaudeOpusFourDotSixStreamSetup } from "@app/lib/model_constructors/test/endpoints/agent_platform_eu_claude_opus_four_dot_six.test";
import { AgentPlatformEuropeClaudeSonnetFiveStreamSetup } from "@app/lib/model_constructors/test/endpoints/agent_platform_eu_claude_sonnet_five.test";
import { AgentPlatformEuropeClaudeSonnetFourDotSixStreamSetup } from "@app/lib/model_constructors/test/endpoints/agent_platform_eu_claude_sonnet_four_dot_six.test";
import { AgentPlatformEuropeGeminiThreeDotOneFlashLiteStreamSetup } from "@app/lib/model_constructors/test/endpoints/agent_platform_eu_gemini_3_1_flash_lite.test";
import { AgentPlatformEuropeGeminiThreeDotFiveFlashStreamSetup } from "@app/lib/model_constructors/test/endpoints/agent_platform_eu_gemini_3_5_flash.test";
import { AnthropicGlobalClaudeFableFiveStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_fable_five.test";
import { AnthropicGlobalClaudeHaikuFourDotFiveStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_haiku_four_dot_five.test";
import { AnthropicGlobalClaudeOpusFourDotEightStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_opus_four_dot_eight.test";
import { AnthropicGlobalClaudeOpusFourDotSevenStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_opus_four_dot_seven.test";
import { AnthropicGlobalClaudeOpusFourDotSixStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_opus_four_dot_six.test";
import { AnthropicGlobalClaudeSonnetFiveStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_sonnet_five.test";
import { AnthropicGlobalClaudeSonnetFourDotSixStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_sonnet_four_dot_six.test";
import { FireworksGlobalDeepSeekV4ProStreamSetup } from "@app/lib/model_constructors/test/endpoints/fireworks_global_deepseek_v4_pro.test";
import { FireworksGlobalGlmFiveDotTwoStreamSetup } from "@app/lib/model_constructors/test/endpoints/fireworks_global_glm_five_dot_two.test";
import { FireworksGlobalKimiK2Dot5StreamSetup } from "@app/lib/model_constructors/test/endpoints/fireworks_global_kimi_k2_dot_five.test";
import { GoogleAiStudioGlobalGeminiThreeDotOneProStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_ai_studio_global_gemini_3_1_pro.test";
import { MistralEuropeCodestralStreamSetup } from "@app/lib/model_constructors/test/endpoints/mistral_eu_codestral.test";
import { MistralEuropeMistralLargeStreamSetup } from "@app/lib/model_constructors/test/endpoints/mistral_eu_mistral_large.test";
import { MistralEuropeMistralMedium35StreamSetup } from "@app/lib/model_constructors/test/endpoints/mistral_eu_mistral_medium_3_5.test";
import { MistralEuropeMistralSmallStreamSetup } from "@app/lib/model_constructors/test/endpoints/mistral_eu_mistral_small.test";
import { OpenAIResponsesEuropeGptFiveStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_eu_gpt_five.test";
import { OpenAIResponsesEuropeGptFiveDotFiveStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_eu_gpt_five_dot_five.test";
import { OpenAIResponsesEuropeGptFiveDotFourStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_eu_gpt_five_dot_four.test";
import { OpenAIResponsesEuropeGptFiveDotFourMiniStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_eu_gpt_five_dot_four_mini.test";
import { OpenAIResponsesEuropeGptFiveDotFourNanoStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_eu_gpt_five_dot_four_nano.test";
import { OpenAIResponsesEuropeGptFiveDotOneStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_eu_gpt_five_dot_one.test";
import { OpenAIResponsesEuropeGptFiveDotTwoStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_eu_gpt_five_dot_two.test";
import { OpenAIResponsesEuropeGptFiveMiniStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_eu_gpt_five_mini.test";
import { OpenAIResponsesEuropeGptFiveNanoStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_eu_gpt_five_nano.test";
import { OpenAIResponsesGlobalGptFiveStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_global_gpt_five.test";
import { OpenAIResponsesGlobalGptFiveDotFiveStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_global_gpt_five_dot_five.test";
import { OpenAIResponsesGlobalGptFiveDotFourStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_global_gpt_five_dot_four.test";
import { OpenAIResponsesGlobalGptFiveDotFourMiniStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_global_gpt_five_dot_four_mini.test";
import { OpenAIResponsesGlobalGptFiveDotFourNanoStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_global_gpt_five_dot_four_nano.test";
import { OpenAIResponsesGlobalGptFiveDotOneStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_global_gpt_five_dot_one.test";
import { OpenAIResponsesGlobalGptFiveDotTwoStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_global_gpt_five_dot_two.test";
import { OpenAIResponsesGlobalGptFiveMiniStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_global_gpt_five_mini.test";
import { OpenAIResponsesGlobalGptFiveNanoStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_responses_global_gpt_five_nano.test";
import { TogetheraiGlobalLlama3370BInstructTurboStreamSetup } from "@app/lib/model_constructors/test/endpoints/togetherai_global_llama_3_3_70b_instruct_turbo.test";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const STREAM_ENDPOINT_SETUPS = {
  [AgentPlatformEuropeClaudeHaikuFourDotFiveStream.id]:
    AgentPlatformEuropeClaudeHaikuFourDotFiveStreamSetup,
  [AgentPlatformEuropeClaudeOpusFourDotEightStream.id]:
    AgentPlatformEuropeClaudeOpusFourDotEightStreamSetup,
  [AgentPlatformEuropeClaudeOpusFourDotSevenStream.id]:
    AgentPlatformEuropeClaudeOpusFourDotSevenStreamSetup,
  [AgentPlatformEuropeClaudeOpusFourDotSixStream.id]:
    AgentPlatformEuropeClaudeOpusFourDotSixStreamSetup,
  [AgentPlatformEuropeClaudeSonnetFiveStream.id]:
    AgentPlatformEuropeClaudeSonnetFiveStreamSetup,
  [AgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    AgentPlatformEuropeClaudeSonnetFourDotSixStreamSetup,
  [AgentPlatformEuropeGeminiThreeDotFiveFlashStream.id]:
    AgentPlatformEuropeGeminiThreeDotFiveFlashStreamSetup,
  [AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream.id]:
    AgentPlatformEuropeGeminiThreeDotOneFlashLiteStreamSetup,
  [AnthropicGlobalClaudeFableFiveStream.id]:
    AnthropicGlobalClaudeFableFiveStreamSetup,
  [AnthropicGlobalClaudeHaikuFourDotFiveStream.id]:
    AnthropicGlobalClaudeHaikuFourDotFiveStreamSetup,
  [AnthropicGlobalClaudeOpusFourDotEightStream.id]:
    AnthropicGlobalClaudeOpusFourDotEightStreamSetup,
  [AnthropicGlobalClaudeOpusFourDotSevenStream.id]:
    AnthropicGlobalClaudeOpusFourDotSevenStreamSetup,
  [AnthropicGlobalClaudeOpusFourDotSixStream.id]:
    AnthropicGlobalClaudeOpusFourDotSixStreamSetup,
  [AnthropicGlobalClaudeSonnetFiveStream.id]:
    AnthropicGlobalClaudeSonnetFiveStreamSetup,
  [AnthropicGlobalClaudeSonnetFourDotSixStream.id]:
    AnthropicGlobalClaudeSonnetFourDotSixStreamSetup,
  [FireworksGlobalDeepSeekV4ProStream.id]:
    FireworksGlobalDeepSeekV4ProStreamSetup,
  [FireworksGlobalGlmFiveDotTwoStream.id]:
    FireworksGlobalGlmFiveDotTwoStreamSetup,
  [FireworksGlobalKimiK2Dot5Stream.id]: FireworksGlobalKimiK2Dot5StreamSetup,
  [GoogleAiStudioGlobalGeminiThreeDotOneProStream.id]:
    GoogleAiStudioGlobalGeminiThreeDotOneProStreamSetup,
  [MistralEuropeCodestralStream.id]: MistralEuropeCodestralStreamSetup,
  [MistralEuropeMistralLargeStream.id]: MistralEuropeMistralLargeStreamSetup,
  [MistralEuropeMistralMedium35Stream.id]:
    MistralEuropeMistralMedium35StreamSetup,
  [MistralEuropeMistralSmallStream.id]: MistralEuropeMistralSmallStreamSetup,
  [OpenAIResponsesEuropeGptFiveDotFiveStream.id]:
    OpenAIResponsesEuropeGptFiveDotFiveStreamSetup,
  [OpenAIResponsesEuropeGptFiveDotFourMiniStream.id]:
    OpenAIResponsesEuropeGptFiveDotFourMiniStreamSetup,
  [OpenAIResponsesEuropeGptFiveDotFourNanoStream.id]:
    OpenAIResponsesEuropeGptFiveDotFourNanoStreamSetup,
  [OpenAIResponsesEuropeGptFiveDotFourStream.id]:
    OpenAIResponsesEuropeGptFiveDotFourStreamSetup,
  [OpenAIResponsesEuropeGptFiveDotOneStream.id]:
    OpenAIResponsesEuropeGptFiveDotOneStreamSetup,
  [OpenAIResponsesEuropeGptFiveDotTwoStream.id]:
    OpenAIResponsesEuropeGptFiveDotTwoStreamSetup,
  [OpenAIResponsesEuropeGptFiveMiniStream.id]:
    OpenAIResponsesEuropeGptFiveMiniStreamSetup,
  [OpenAIResponsesEuropeGptFiveNanoStream.id]:
    OpenAIResponsesEuropeGptFiveNanoStreamSetup,
  [OpenAIResponsesEuropeGptFiveStream.id]:
    OpenAIResponsesEuropeGptFiveStreamSetup,
  [OpenAIResponsesGlobalGptFiveDotFiveStream.id]:
    OpenAIResponsesGlobalGptFiveDotFiveStreamSetup,
  [OpenAIResponsesGlobalGptFiveDotFourMiniStream.id]:
    OpenAIResponsesGlobalGptFiveDotFourMiniStreamSetup,
  [OpenAIResponsesGlobalGptFiveDotFourNanoStream.id]:
    OpenAIResponsesGlobalGptFiveDotFourNanoStreamSetup,
  [OpenAIResponsesGlobalGptFiveDotFourStream.id]:
    OpenAIResponsesGlobalGptFiveDotFourStreamSetup,
  [OpenAIResponsesGlobalGptFiveDotOneStream.id]:
    OpenAIResponsesGlobalGptFiveDotOneStreamSetup,
  [OpenAIResponsesGlobalGptFiveDotTwoStream.id]:
    OpenAIResponsesGlobalGptFiveDotTwoStreamSetup,
  [OpenAIResponsesGlobalGptFiveMiniStream.id]:
    OpenAIResponsesGlobalGptFiveMiniStreamSetup,
  [OpenAIResponsesGlobalGptFiveNanoStream.id]:
    OpenAIResponsesGlobalGptFiveNanoStreamSetup,
  [OpenAIResponsesGlobalGptFiveStream.id]:
    OpenAIResponsesGlobalGptFiveStreamSetup,
  [TogetheraiGlobalLlama3370BInstructTurboStream.id]:
    TogetheraiGlobalLlama3370BInstructTurboStreamSetup,
} satisfies Record<StreamEndpointId, StreamSetup>;
