import { GoogleGenAI } from "@google/genai";
import { Message, AuthorType } from '../types';

// Helper to format chat history for Gemini
const formatHistoryForGemini = (history: Message[]) => {
  const contents = history.map(msg => {
    const role: 'user' | 'model' = (msg.authorType === AuthorType.HUMAN) ? 'user' : 'model';
    const text = (role === 'model') ? `${msg.author}: ${msg.content}` : msg.content;
    return {
      role,
      parts: [{ text }]
    };
  });

  if (contents.length < 2) {
    return contents;
  }

  const mergedContents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  let lastMessage: { role: "user" | "model"; parts: { text: string; }[]; } = { ...contents[0] };

  for (let i = 1; i < contents.length; i++) {
    const currentMessage = contents[i];
    if (lastMessage.role === 'model' && currentMessage.role === 'model') {
      lastMessage.parts[0].text += `\n\n${currentMessage.parts[0].text}`;
    } 
    else {
      mergedContents.push(lastMessage);
      lastMessage = { ...currentMessage };
    }
  }
  mergedContents.push(lastMessage);
  
  // Gemini API requires the conversation to end with a 'user' role for the model to respond.
  // If the last message is from a 'model', we add a placeholder user message to prompt a continuation.
  if (mergedContents.length > 0 && mergedContents[mergedContents.length - 1].role === 'model') {
    mergedContents.push({ role: 'user', parts: [{ text: "Please continue the conversation." }] });
  }

  return mergedContents;
};


// Helper to format chat history for OpenAI-compatible APIs
const formatHistoryForOpenAI = (history: Message[]) => {
    const messages = history.map(msg => {
        const role: 'user' | 'assistant' = msg.authorType === AuthorType.HUMAN ? 'user' : 'assistant';
        const content = role === 'assistant' ? `${msg.author}: ${msg.content}` : msg.content;
        return { role, content };
    });

    if (messages.length < 2) {
        return messages;
    }

    const mergedMessages: { role: 'user' | 'assistant'; content: string }[] = [];
    let lastMessage = { ...messages[0] };

    for (let i = 1; i < messages.length; i++) {
        const currentMessage = messages[i];
        if (lastMessage.role === 'assistant' && currentMessage.role === 'assistant') {
            lastMessage.content += `\n\n${currentMessage.content}`;
        } else {
            mergedMessages.push(lastMessage);
            lastMessage = { ...currentMessage };
        }
    }
    mergedMessages.push(lastMessage);
    
    // If the last message is from an assistant, add a user prompt to continue.
    if (mergedMessages.length > 0 && mergedMessages[mergedMessages.length - 1].role === 'assistant') {
      mergedMessages.push({ role: 'user', content: "Please continue the conversation." });
    }

    return mergedMessages;
};

export const getGeminiResponse = async (history: Message[], systemInstruction: string): Promise<string> => {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set for Gemini.");
    }
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: formatHistoryForGemini(history),
            config: {
              systemInstruction: systemInstruction,
            }
        });
        return response.text;
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new Error(`Gemini API request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};

export const getOpenRouterResponse = async (model: string, history: Message[], apiKey: string, systemInstruction: string): Promise<string> => {
    if (!apiKey) {
        throw new Error("OpenRouter API key has not been provided in settings.");
    }
    
    const formattedHistory = formatHistoryForOpenAI(history);
    const messages = systemInstruction 
        ? [{ role: 'system', content: systemInstruction }, ...formattedHistory] 
        : formattedHistory;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "AI Bot Chat Room",
            "X-Title": "AI Bot Chat Room"
        },
        body: JSON.stringify({
            model: model,
            messages: messages
        })
    });

    if (!response.ok) {
        const errorData = await response.text();
        if (response.status === 401) {
            let specificMessage = "Invalid API Key.";
            try {
                const errorJson = JSON.parse(errorData);
                specificMessage = errorJson?.error?.message || specificMessage;
            } catch (e) { /* Not a JSON response, use default message */ }
            throw new Error(`Authentication Error: ${specificMessage} Please check your API key in settings.`);
        }
        throw new Error(`API Error (${response.status}): ${errorData}`);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0 || !data.choices[0].message?.content) {
        throw new Error("Received an invalid or empty response from OpenRouter.");
    }
    return data.choices[0].message.content;
};

export const getLmStudioResponse = async (history: Message[], url: string, systemInstruction: string): Promise<string> => {
    if (!url) {
        throw new Error("LM Studio URL is not provided.");
    }
    try {
        const formattedHistory = formatHistoryForOpenAI(history);
        const messages = systemInstruction 
            ? [{ role: 'system', content: systemInstruction }, ...formattedHistory] 
            : formattedHistory;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "local-model",
                messages: messages,
                temperature: 0.7,
            })
        });

        if (!response.ok) {
             const errorData = await response.text();
            throw new Error(`LM Studio API Error (${response.status}): ${errorData}`);
        }

        const data = await response.json();
        if (!data.choices || data.choices.length === 0 || !data.choices[0].message?.content) {
            throw new Error("Received an invalid or empty response from LM Studio.");
        }
        return data.choices[0].message.content;
    } catch (error) {
        console.error("LM Studio API Error:", error);
        throw new Error(`LM Studio request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};