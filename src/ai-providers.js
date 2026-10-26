// Mirrors the fixed provider list in supabase/functions/health-api/chat.mjs.
export const aiProviders={
 openai:{name:'OpenAI',company:'OpenAI',model:'gpt-4.1-mini',link:'https://platform.openai.com/api-keys',mark:'O',note:'ChatGPT models. Also unlocks voice notes and portraits.'},
 anthropic:{name:'Claude',company:'Anthropic',model:'claude-opus-5-5',link:'https://console.anthropic.com/settings/keys',mark:'A',note:'Claude models from Anthropic.'},
 gemini:{name:'Gemini',company:'Google',model:'gemini-3.8-flash',link:'https://aistudio.google.com/apikey',mark:'G',note:'Google Gemini models.'},
 openrouter:{name:'OpenRouter',company:'OpenRouter',model:'openrouter/auto',link:'https://openrouter.ai/settings/keys',mark:'R',note:'One key for hundreds of models: Llama, Qwen, Claude, GPT, Gemini and more.'},
 mistral:{name:'Mistral',company:'Mistral AI',model:'mistral-large-latest',link:'https://console.mistral.ai/api-keys',mark:'M',note:'Mistral and Pixtral models.'},
 groq:{name:'Groq',company:'Groq',model:'llama-3.3-70b-versatile',link:'https://console.groq.com/keys',mark:'Q',note:'Very fast open models such as Llama.'},
 xai:{name:'Grok',company:'xAI',model:'grok-4',link:'https://console.x.ai',mark:'X',note:'Grok models from xAI.'},
 deepseek:{name:'DeepSeek',company:'DeepSeek',model:'deepseek-chat',link:'https://platform.deepseek.com/api_keys',mark:'D',note:'DeepSeek chat and reasoning models. Text only.'}
};
export const providerName=id=>aiProviders[id]?.name||'AI';
export const providerCompany=id=>aiProviders[id]?.company||'your AI provider';
