
import React from 'react';
import { Message, AuthorType } from '../types';
import { BOT_CONFIG } from '../constants';

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isHuman = message.authorType === AuthorType.HUMAN;
  const config = BOT_CONFIG[message.authorType] || BOT_CONFIG.openrouter;
  
  const AuthorIcon: React.FC<{ type: AuthorType }> = ({ type }) => {
    switch (type) {
      case AuthorType.GEMINI:
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-cyan-300"><path d="M12.943 3.637a2 2 0 0 0-1.886 0L3.14 8.845a2 2 0 0 0-1.077 1.758v9.11a2 2 0 0 0 2 2h15.874a2 2 0 0 0 2-2v-9.11a2 2 0 0 0-1.077-1.758L12.943 3.637Z"/></svg>;
      case AuthorType.LM_STUDIO:
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-300"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>;
      case AuthorType.OPENROUTER:
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-300"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>;
      case AuthorType.HUMAN:
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
      default:
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-300"><path d="m12 14-4-4h8z"/><path d="M12 2a10 10 0 1 0 10 10H12V2z"/></svg>;
    }
  };

  const authorName = message.authorType === AuthorType.OPENROUTER ? `OR / ${message.author.split('/').pop()}` : message.author;
  const authorType = message.authorType === AuthorType.OPENROUTER ? AuthorType.OPENROUTER : message.authorType;
  
  return (
    <div className={`flex items-start gap-4 my-4 ${isHuman ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex-shrink-0 w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center border-2 ${isHuman ? 'border-slate-500' : `border-slate-600`}`}>
         <AuthorIcon type={authorType} />
      </div>
      <div className={`w-full max-w-xl p-4 rounded-lg shadow-md ${isHuman ? 'bg-slate-700' : 'bg-slate-800'}`}>
        <div className={`flex items-center mb-2 ${isHuman ? 'justify-end' : ''}`}>
          <p className={`font-bold text-sm bg-clip-text text-transparent bg-gradient-to-r ${config.color}`}>{authorName}</p>
        </div>
        <p className="text-slate-200 whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </div>
  );
};

export default ChatMessage;
