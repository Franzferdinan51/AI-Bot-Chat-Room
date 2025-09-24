
import React, { useState } from 'react';
import type { Settings } from '../types';
import { OPENROUTER_MODELS } from '../constants';

interface SettingsPanelProps {
  settings: Settings;
  onSettingsChange: (newSettings: Settings) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onSettingsChange, isOpen, onToggle }) => {
  const [newModelInput, setNewModelInput] = useState('');

  const handleAddModel = (model: string) => {
    const trimmedModel = model.trim();
    if (trimmedModel && !settings.activeBots.openRouterModels.includes(trimmedModel)) {
      const newModels = [...settings.activeBots.openRouterModels, trimmedModel];
      onSettingsChange({
        ...settings,
        activeBots: { ...settings.activeBots, openRouterModels: newModels },
      });
    }
  };

  const handleRemoveModel = (modelToRemove: string) => {
    const newModels = settings.activeBots.openRouterModels.filter(m => m !== modelToRemove);
    onSettingsChange({
      ...settings,
      activeBots: { ...settings.activeBots, openRouterModels: newModels },
    });
  };
  
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAddModel(newModelInput);
    setNewModelInput('');
  };

  const handleCheckboxChange = (bot: 'gemini' | 'lmStudio') => {
    onSettingsChange({
        ...settings,
        activeBots: { ...settings.activeBots, [bot]: !settings.activeBots[bot] },
    });
  };

  const handleInputChange = (field: 'openRouterApiKey' | 'lmStudioUrl', value: string) => {
    onSettingsChange({ ...settings, [field]: value });
  };


  return (
    <>
      <button 
        onClick={onToggle}
        className="fixed top-4 right-4 z-30 p-2 bg-slate-700 rounded-full text-white hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-transform duration-300"
        aria-label="Toggle settings"
        >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`}><path d="M12.22 2h-4.44a2 2 0 0 0-2 2v.78a2 2 0 0 1-.59 1.4l-4.12 4.12a2 2 0 0 0 0 2.82l4.12 4.12a2 2 0 0 1 .59 1.4v.78a2 2 0 0 0 2 2h4.44a2 2 0 0 0 2-2v-.78a2 2 0 0 1 .59-1.4l4.12-4.12a2 2 0 0 0 0-2.82l-4.12-4.12a2 2 0 0 1-.59-1.4V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>

      <div className={`fixed top-0 right-0 h-full bg-slate-800/95 backdrop-blur-sm shadow-2xl z-20 transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} w-full max-w-sm p-6 overflow-y-auto`}>
        <h2 className="text-2xl font-bold mb-6 text-cyan-300">Bot Configuration</h2>

        {/* Gemini Settings */}
        <div className="mb-6 p-4 border border-slate-700 rounded-lg">
            <h3 className="text-lg font-semibold mb-3 text-white">Gemini API</h3>
            <p className="text-sm text-slate-400 mb-3">Gemini API key is securely loaded from environment variables.</p>
            <label className="flex items-center cursor-pointer">
                <input
                    type="checkbox"
                    className="w-4 h-4 text-blue-500 bg-slate-700 border-slate-600 rounded focus:ring-blue-600"
                    checked={settings.activeBots.gemini}
                    onChange={() => handleCheckboxChange('gemini')}
                />
                <span className="ml-3 text-slate-300">Enable Gemini Bot</span>
            </label>
        </div>

        {/* LM Studio Settings */}
        <div className="mb-6 p-4 border border-slate-700 rounded-lg">
            <h3 className="text-lg font-semibold mb-2 text-white">LM Studio</h3>
            <label htmlFor="lmStudioUrl" className="block text-sm font-medium text-slate-400 mb-1">Server URL</label>
            <input
                id="lmStudioUrl"
                type="text"
                value={settings.lmStudioUrl}
                onChange={(e) => handleInputChange('lmStudioUrl', e.target.value)}
                placeholder="http://localhost:1234/v1/chat/completions"
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
             <label className="flex items-center cursor-pointer mt-4">
                <input
                    type="checkbox"
                    className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-600"
                    checked={settings.activeBots.lmStudio}
                    onChange={() => handleCheckboxChange('lmStudio')}
                />
                <span className="ml-3 text-slate-300">Enable LM Studio Bot</span>
            </label>
        </div>

        {/* OpenRouter Settings */}
        <div className="p-4 border border-slate-700 rounded-lg">
            <h3 className="text-lg font-semibold mb-2 text-white">OpenRouter</h3>
             <label htmlFor="openRouterApiKey" className="block text-sm font-medium text-slate-400 mb-1">API Key</label>
            <input
                id="openRouterApiKey"
                type="password"
                value={settings.openRouterApiKey}
                onChange={(e) => handleInputChange('openRouterApiKey', e.target.value)}
                placeholder="Enter your OpenRouter key"
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <p className="text-xs text-slate-500 mt-1 mb-4">
                You can find your key on the{' '}
                <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline"
                >
                    OpenRouter keys page
                </a>.
            </p>
            
            <h4 className="text-md font-semibold mt-4 mb-2 text-slate-300">Add Custom Model</h4>
            <form onSubmit={handleAddSubmit} className="flex items-center gap-2">
                <input
                    type="text"
                    value={newModelInput}
                    onChange={(e) => setNewModelInput(e.target.value)}
                    placeholder="vendor/model-name:version"
                    className="flex-grow bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                    aria-label="Add OpenRouter model"
                />
                <button type="submit" className="px-3 py-2 bg-green-600 hover:bg-green-500 rounded-md text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-green-500">Add</button>
            </form>

            <h4 className="text-md font-semibold mt-4 mb-2 text-slate-300">Active Models ({settings.activeBots.openRouterModels.length})</h4>
            <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                {settings.activeBots.openRouterModels.length > 0 ? (
                    settings.activeBots.openRouterModels.map(model => (
                        <div key={model} className="flex items-center justify-between bg-slate-700 p-2 rounded-md animate-fade-in">
                            <span className="text-sm text-slate-300 truncate pr-2" title={model}>{model}</span>
                            <button onClick={() => handleRemoveModel(model)} className="text-slate-400 hover:text-red-400 transition-colors text-xs font-bold focus:outline-none focus:ring-1 focus:ring-red-400 rounded-sm" aria-label={`Remove ${model}`}>REMOVE</button>
                        </div>
                    ))
                ) : (
                    <p className="text-sm text-slate-500 italic">No custom models added.</p>
                )}
            </div>

            <h4 className="text-md font-semibold mt-4 mb-2 text-slate-300">Suggested Models</h4>
            <div className="flex flex-wrap gap-2">
                {OPENROUTER_MODELS.map(model => (
                    <button
                        key={model}
                        onClick={() => handleAddModel(model)}
                        disabled={settings.activeBots.openRouterModels.includes(model)}
                        className="px-2 py-1 bg-slate-600 text-slate-300 text-xs rounded-md hover:bg-slate-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={`Add ${model}`}
                    >
                        {model}
                    </button>
                ))}
            </div>
        </div>

      </div>
    </>
  );
};

export default SettingsPanel;
