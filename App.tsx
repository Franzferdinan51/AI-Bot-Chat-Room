
import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Message, Settings } from './types';
import { AuthorType } from './types';
import { getGeminiResponse, getOpenRouterResponse, getLmStudioResponse } from './services/aiService';
import { BOT_CONFIG } from './constants';
import SettingsPanel from './components/SettingsPanel';
import ChatWindow from './components/ChatWindow';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
      {
          id: 'init-1',
          author: 'System',
          authorType: AuthorType.SYSTEM,
          content: "Welcome to the AI Bot Chat Room! Click the gear icon to configure your bots, then send a message or press the 'play' button to start a bot-to-bot conversation."
      }
  ]);
  const [settings, setSettings] = useState<Settings>({
    openRouterApiKey: '',
    lmStudioUrl: 'http://localhost:1234/v1/chat/completions',
    activeBots: {
      gemini: true,
      lmStudio: false,
      openRouterModels: [],
    },
  });
  const [loadingBots, setLoadingBots] = useState<Set<string>>(new Set());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBotConversationRunning, setIsBotConversationRunning] = useState(false);
  const conversationTimeoutRef = useRef<number | null>(null);


  const addMessage = useCallback((message: Omit<Message, 'id'>) => {
    setMessages(prev => [...prev, { ...message, id: Date.now().toString() + Math.random() }]);
  }, []);

  const stopConversation = useCallback(() => {
    setIsBotConversationRunning(false);
    if (conversationTimeoutRef.current) {
        clearTimeout(conversationTimeoutRef.current);
        conversationTimeoutRef.current = null;
    }
    setLoadingBots(new Set());
  }, []);

  const triggerBotResponses = useCallback(async (currentHistory: Message[]) => {
    const systemInstruction = 'You are a helpful AI assistant in a chat room with other AIs and a human. The human has just sent a message. Please provide a direct, helpful, and concise response to the human user.';
    
    const parallelTasks: {name: string, type: AuthorType, promise: Promise<string>}[] = [];
    const openRouterModelsToQuery: string[] = [];

    if (settings.activeBots.gemini) {
        parallelTasks.push({ 
            name: BOT_CONFIG.gemini.name, 
            type: AuthorType.GEMINI, 
            promise: getGeminiResponse(currentHistory, systemInstruction) 
        });
    }

    if (settings.activeBots.lmStudio) {
         parallelTasks.push({ 
            name: BOT_CONFIG.lmstudio.name, 
            type: AuthorType.LM_STUDIO, 
            promise: getLmStudioResponse(currentHistory, settings.lmStudioUrl, systemInstruction) 
        });
    }

    if (settings.activeBots.openRouterModels.length > 0) {
        if (!settings.openRouterApiKey) {
            addMessage({
                author: 'System',
                authorType: AuthorType.SYSTEM,
                content: `OpenRouter Error: API key is missing. Please add it in settings.`,
            });
        } else {
            openRouterModelsToQuery.push(...settings.activeBots.openRouterModels);
        }
    }
    
    if (parallelTasks.length === 0 && openRouterModelsToQuery.length === 0) {
        addMessage({ author: 'System', authorType: AuthorType.SYSTEM, content: "No active bots to respond. Please enable a bot in settings." });
        return;
    }

    const openRouterBotNames = openRouterModelsToQuery.map(model => `OR / ${model.split('/').pop()}`);
    setLoadingBots(new Set([...parallelTasks.map(task => task.name), ...openRouterBotNames]));

    // --- Handle parallel tasks (Gemini, LM Studio) ---
    parallelTasks.forEach(task => {
        task.promise
            .then(content => {
                addMessage({ author: task.name, authorType: AuthorType.GEMINI, content });
            })
            .catch(error => {
                addMessage({
                    author: 'System', authorType: AuthorType.SYSTEM,
                    content: `Error from ${task.name}: ${error.message || ''}`,
                });
            })
            .finally(() => {
                setLoadingBots(prev => {
                    const newLoadingBots = new Set(prev);
                    newLoadingBots.delete(task.name);
                    return newLoadingBots;
                });
            });
    });

    // --- Handle sequential tasks (OpenRouter) with delay ---
    let openRouterAuthErrorShown = false;
    for (let i = 0; i < openRouterModelsToQuery.length; i++) {
        const model = openRouterModelsToQuery[i];
        const taskName = `OR / ${model.split('/').pop()}`;
        try {
            const content = await getOpenRouterResponse(model, currentHistory, settings.openRouterApiKey, systemInstruction);
            addMessage({ author: model, authorType: AuthorType.OPENROUTER, content });
        } catch (error) {
            const errorMessage = error.message || '';
            const isAuthError = errorMessage.includes('Authentication Error');
            
            if (isAuthError && openRouterAuthErrorShown) continue; // Show only one auth error
            if (isAuthError) openRouterAuthErrorShown = true;

            addMessage({
                author: 'System', authorType: AuthorType.SYSTEM,
                content: `Error from ${taskName}: ${errorMessage}`,
            });
        } finally {
            setLoadingBots(prev => {
                const newLoadingBots = new Set(prev);
                newLoadingBots.delete(taskName);
                return newLoadingBots;
            });
        }

        // Wait 3 seconds before the next OpenRouter request
        if (i < openRouterModelsToQuery.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
  }, [settings, addMessage]);

  const handleHumanSendMessage = (content: string) => {
    if (isBotConversationRunning) {
        stopConversation();
    }
    const humanMessage = {
        author: 'You',
        authorType: AuthorType.HUMAN,
        content: content
    };
    const newHistory = [...messages, { ...humanMessage, id: 'temp-human' }];
    setMessages(newHistory);
    triggerBotResponses(newHistory);
  };
  
  const triggerAutonomousBotResponses = useCallback(async (currentHistory: Message[]) => {
    const activeBotsList: { name: string; type: AuthorType; model?: string; maker: string; }[] = [];
    if (settings.activeBots.gemini) { activeBotsList.push({ name: BOT_CONFIG.gemini.name, type: AuthorType.GEMINI, maker: 'Google' }); }
    if (settings.activeBots.lmStudio) { activeBotsList.push({ name: BOT_CONFIG.lmstudio.name, type: AuthorType.LM_STUDIO, maker: 'the user via LM Studio' }); }
    
    if (settings.activeBots.openRouterModels.length > 0) {
        if (!settings.openRouterApiKey) {
            addMessage({ author: 'System', authorType: AuthorType.SYSTEM, content: "OpenRouter bots paused: API key missing." });
        } else {
             settings.activeBots.openRouterModels.forEach(model => { 
                activeBotsList.push({ name: `OR / ${model.split('/').pop()}`, type: AuthorType.OPENROUTER, model, maker: model.split('/')[0] || 'OpenRouter' }); 
            });
        }
    }

    if (activeBotsList.length < 1) {
        addMessage({ author: 'System', authorType: AuthorType.SYSTEM, content: "No active bots to have a conversation. Please enable bots in settings." });
        stopConversation();
        return;
    }

    const parallelBots = activeBotsList.filter(b => b.type !== AuthorType.OPENROUTER);
    const openRouterBots = activeBotsList.filter(b => b.type === AuthorType.OPENROUTER);
    
    setLoadingBots(new Set(activeBotsList.map(b => b.name)));

    // --- Handle parallel bots ---
    parallelBots.forEach(bot => {
        const systemInstruction = `You are ${bot.name}, an AI in a chat room. Engage naturally. Your maker is ${bot.maker}.`;
        const promise = bot.type === AuthorType.GEMINI 
            ? getGeminiResponse(currentHistory, systemInstruction)
            : getLmStudioResponse(currentHistory, settings.lmStudioUrl, systemInstruction);
        
        promise
            .then(content => addMessage({ author: bot.name, authorType: bot.type, content }))
            .catch(error => addMessage({ author: 'System', authorType: AuthorType.SYSTEM, content: `Error from ${bot.name}: ${error.message}`}))
            .finally(() => setLoadingBots(prev => {
                const newLoadingBots = new Set(prev);
                newLoadingBots.delete(bot.name);
                return newLoadingBots;
            }));
    });

    // --- Handle sequential OpenRouter bots with delay ---
    let openRouterAuthErrorShown = false;
    for (let i = 0; i < openRouterBots.length; i++) {
        const bot = openRouterBots[i];
        const systemInstruction = `You are ${bot.name}, an AI in a chat room. Engage naturally. Your maker is ${bot.maker}.`;
        try {
            const content = await getOpenRouterResponse(bot.model!, currentHistory, settings.openRouterApiKey, systemInstruction);
            addMessage({ author: bot.model!, authorType: bot.type, content });
        } catch (error) {
            const errorMessage = error.message || '';
            const isAuthError = errorMessage.includes('Authentication Error');
            
            if (isAuthError && openRouterAuthErrorShown) continue;
            if (isAuthError) openRouterAuthErrorShown = true;

            addMessage({ author: 'System', authorType: AuthorType.SYSTEM, content: `Error from ${bot.name}: ${errorMessage}` });
        } finally {
            setLoadingBots(prev => {
                const newLoadingBots = new Set(prev);
                newLoadingBots.delete(bot.name);
                return newLoadingBots;
            });
        }

        if (i < openRouterBots.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
  }, [settings, addMessage, stopConversation]);
  
  useEffect(() => {
    if (!isBotConversationRunning) {
        return;
    }

    const conversationLoop = () => {
        if (loadingBots.size === 0) {
            triggerAutonomousBotResponses(messages);
        }
    };
    
    conversationTimeoutRef.current = window.setTimeout(conversationLoop, 5000);

    return () => {
        if (conversationTimeoutRef.current) {
            clearTimeout(conversationTimeoutRef.current);
        }
    };
  }, [isBotConversationRunning, messages, loadingBots.size, triggerAutonomousBotResponses]);

  const handleStartStopConversation = () => {
    if (isBotConversationRunning) {
        stopConversation();
        addMessage({ author: 'System', authorType: AuthorType.SYSTEM, content: "Bot conversation paused." });
    } else {
        setIsBotConversationRunning(true);
        addMessage({ author: 'System', authorType: AuthorType.SYSTEM, content: "Starting bot conversation..." });
        // Immediately trigger the first round
        triggerAutonomousBotResponses(messages);
    }
  };


  return (
    <div className="h-screen w-screen flex antialiased">
      <main className="flex-1 h-full">
        <ChatWindow
            messages={messages}
            loadingBots={loadingBots}
            onSendMessage={handleHumanSendMessage}
            isBotConversationRunning={isBotConversationRunning}
            onStartStopConversation={handleStartStopConversation}
        />
      </main>
      <SettingsPanel
        settings={settings}
        onSettingsChange={setSettings}
        isOpen={isSettingsOpen}
        onToggle={() => setIsSettingsOpen(!isSettingsOpen)}
      />
    </div>
  );
};

export default App;
