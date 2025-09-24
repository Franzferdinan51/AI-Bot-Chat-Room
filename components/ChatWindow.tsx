import React, { useRef, useEffect } from 'react';
import type { Message } from '../types';
import ChatMessage from './ChatMessage';
import MessageInput from './MessageInput';

interface ChatWindowProps {
  messages: Message[];
  loadingBots: Set<string>;
  onSendMessage: (content: string) => void;
  isBotConversationRunning: boolean;
  onStartStopConversation: () => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages, loadingBots, onSendMessage, isBotConversationRunning, onStartStopConversation }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const isHumanLoading = loadingBots.size > 0;

  return (
    <div className="flex flex-col h-full bg-slate-900">
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {Array.from(loadingBots).map(botName => (
             <div key={botName} className="flex items-start gap-4 my-4 flex-row">
                 <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center border-2 border-slate-600 animate-pulse"></div>
                 <div className="w-full max-w-xl p-4 rounded-lg shadow-md bg-slate-800">
                     <div className="flex items-center mb-2">
                         <p className="font-bold text-sm text-slate-400">{botName} is typing...</p>
                     </div>
                     <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></div>
                    </div>
                 </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <MessageInput 
        onSendMessage={onSendMessage} 
        isLoading={isHumanLoading} 
        isBotConversationRunning={isBotConversationRunning}
        onStartStopConversation={onStartStopConversation}
      />
    </div>
  );
};

export default ChatWindow;