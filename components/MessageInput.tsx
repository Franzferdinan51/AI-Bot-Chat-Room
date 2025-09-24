import React, { useState } from 'react';

interface MessageInputProps {
  onSendMessage: (content: string) => void;
  isLoading: boolean;
  isBotConversationRunning: boolean;
  onStartStopConversation: () => void;
}

const MessageInput: React.FC<MessageInputProps> = ({ onSendMessage, isLoading, isBotConversationRunning, onStartStopConversation }) => {
  const [content, setContent] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Allow sending messages even if bots are conversing, but not if anyone is currently loading a response.
    if (content.trim() && !isLoading) {
      onSendMessage(content.trim());
      setContent('');
    }
  };
  
  const placeholderText = isLoading 
    ? "Bots are responding..." 
    : isBotConversationRunning 
    ? "Interject in the conversation..." 
    : "Chat with the bots...";

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-slate-800/80 backdrop-blur-sm border-t border-slate-700">
      <div className="flex items-center gap-2">
         <button
          type="button"
          onClick={onStartStopConversation}
          className={`flex-shrink-0 p-2.5 rounded-full text-white transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 ${
            isBotConversationRunning
              ? 'bg-gradient-to-br from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 focus:ring-red-400'
              : 'bg-gradient-to-br from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 focus:ring-emerald-400'
          }`}
          aria-label={isBotConversationRunning ? "Stop conversation" : "Start conversation"}
        >
          {isBotConversationRunning ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>
        <div className="flex-grow flex items-center bg-slate-900 rounded-full border border-slate-700 focus-within:ring-2 focus-within:ring-cyan-500 transition-shadow">
            <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholderText}
            className="w-full bg-transparent px-6 py-3 text-white placeholder-slate-500 focus:outline-none"
            disabled={isLoading}
            />
            <button
            type="submit"
            disabled={isLoading || !content.trim()}
            className="m-1.5 p-2.5 bg-gradient-to-br from-cyan-500 to-blue-500 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:from-cyan-400 hover:to-blue-400 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-400"
            aria-label="Send message"
            >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
        </div>
      </div>
    </form>
  );
};

export default MessageInput;