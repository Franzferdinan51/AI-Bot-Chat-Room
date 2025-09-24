
export enum AuthorType {
  HUMAN = 'human',
  GEMINI = 'gemini',
  OPENROUTER = 'openrouter',
  LM_STUDIO = 'lmstudio',
  SYSTEM = 'system',
}

export interface Message {
  id: string;
  author: string;
  content: string;
  authorType: AuthorType;
}

export interface Settings {
  openRouterApiKey: string;
  lmStudioUrl: string;
  activeBots: {
    gemini: boolean;
    lmStudio: boolean;
    openRouterModels: string[];
  };
}
